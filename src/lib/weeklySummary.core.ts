import { MAX_SUMMARY_CHARS, PROMPT_HEAD } from "./weeklySummary.prompt";

export { MAX_SUMMARY_CHARS };

export type WeekCaseInput = { summary: string | null; resolution: string | null };

/** Dados que vêm do app (filtro de semana), não do modelo. */
export type WeekMeta = {
  /** Ex: "10/08 a 16/08". Use formatPeriodLabel() para gerar. */
  periodLabel: string;
  /** Canal de escalonamento para o N3. */
  escalationChannel: string;
};

export const GATEWAY_URL = "https://openrouter.ai/api/v1/chat/completions";
export const MODEL = "openai/gpt-6-luna";
export const MAX_TOKENS = 8000;
/** Máximo de caracteres do bloco de casos enviado ao modelo. */
export const MAX_INPUT_CHARS = 60_000;
const MAX_FIELD_CHARS = 600;
/** Quantas chamadas de continuação são permitidas quando a resposta é cortada. */
export const MAX_CONTINUATIONS = 3;

const TIME_ZONE = "America/Sao_Paulo";

/**
 * Formata o rótulo do período a partir das datas do filtro.
 * Usa o fuso da operação para não deslocar o dia em bancos que gravam UTC.
 */
export function formatPeriodLabel(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: TIME_ZONE,
  });
  return `${fmt.format(start)} a ${fmt.format(end)}`;
}

function clip(value: string | null, max = MAX_FIELD_CHARS) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export type CasesBlock = {
  /** Linhas dos casos, já dentro do limite de caracteres. */
  block: string;
  /** Quantos casos entraram de fato no prompt. */
  included: number;
  /** Quantos ficaram de fora por limite de tamanho. */
  dropped: number;
};

export function buildCasesBlock(cases: WeekCaseInput[]): CasesBlock {
  const lines: string[] = [];
  let total = 0;
  for (const c of cases) {
    const line = `- Problema: ${clip(c.summary)} | Resolução: ${clip(c.resolution)}`;
    if (total + line.length + 1 > MAX_INPUT_CHARS) break;
    total += line.length + 1;
    lines.push(line);
  }
  return {
    block: lines.join("\n"),
    included: lines.length,
    dropped: cases.length - lines.length,
  };
}

/** Impede que um placeholder não substituído chegue ao modelo. */
function assertNoPlaceholders(prompt: string) {
  const found = prompt.match(/\{\{[A-Z_]+\}\}/g);
  if (found) {
    throw new Error(`Variável não substituída no prompt: ${[...new Set(found)].join(", ")}`);
  }
}

export function buildPrompt(cases: WeekCaseInput[], meta: WeekMeta): string {
  const periodLabel = meta.periodLabel?.trim();
  const channel = meta.escalationChannel?.trim();

  if (!periodLabel) throw new Error("periodLabel obrigatório para gerar o boletim.");
  if (!channel) throw new Error("escalationChannel obrigatório para gerar o boletim.");

  const { block, included, dropped } = buildCasesBlock(cases);

  const truncationNote =
    dropped > 0
      ? `\n> Atenção: por limite de tamanho, só ${included} dos ${cases.length} casos estão detalhados abaixo. Mantenha ${cases.length} na linha de casos resolvidos, mas faça a contagem por área somar ${included}.\n`
      : "";

  const prompt =
    PROMPT_HEAD.replaceAll("{{PERIODO}}", periodLabel)
      .replaceAll("{{TOTAL_CASOS}}", String(cases.length))
      .replaceAll("{{CANAL_ESCALONAMENTO}}", channel)
      .replaceAll("{{NOTA_TRUNCAMENTO}}", truncationNote) + `<casos>\n${block}\n</casos>\n`;

  assertNoPlaceholders(prompt);
  return prompt;
}

type ChatMessage = { role: "user" | "assistant"; content: string };

type GatewayChoice = {
  message?: { content?: string };
  finish_reason?: string | null;
};

export type SummaryResult =
  { ok: true; text: string; truncated: boolean } | { ok: false; message: string };

const FIELD_LABELS = ["Impacto para a clínica", "Por que aconteceu", "O que fizemos", "Status"];

/**
 * Corrige blocos grudados na emenda entre chunks de continuação.
 * Idempotente: texto já correto passa sem alteração.
 */
export function fixGluedBlocks(md: string): string {
  const labels = FIELD_LABELS.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return (
    md
      // rótulo em negrito grudado no texto anterior
      .replace(new RegExp(`([^\\n])(\\*\\*(?:${labels}):\\*\\*)`, "g"), "$1\n\n$2")
      // cabeçalho markdown grudado no texto anterior (o "#" fica de fora: senão "### 1." vira "#" + "## 1.")
      .replace(/([^\n #])(#{1,6} )/g, "$1\n\n$2")
  );
}

export async function generateSummaryText(
  cases: WeekCaseInput[],
  key: string,
  meta: WeekMeta,
  fetchImpl: typeof fetch = fetch,
): Promise<SummaryResult> {
  if (!cases.length) return { ok: false, message: "Nenhum caso resolvido nesta semana." };

  let prompt: string;
  try {
    prompt = buildPrompt(cases, meta);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Prompt inválido." };
  }

  const messages: ChatMessage[] = [{ role: "user", content: prompt }];
  let text = "";
  let truncated = false;

  for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt++) {
    const res = await fetchImpl(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": "https://cloudia.com.br",
        "X-Title": "Cloudia Suporte Avancado",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        reasoning: { effort: "low" },
        messages,
      }),
    });

    if (!res.ok) {
      if (text) return { ok: true, text, truncated: true };
      const body = await res.text().catch(() => "");
      if (res.status === 429)
        return {
          ok: false,
          message: "Limite de requisições atingido. Tente novamente em instantes.",
        };
      if (res.status === 402)
        return { ok: false, message: "Créditos de IA esgotados. Adicione créditos no OpenRouter." };
      return { ok: false, message: `Erro da IA (${res.status}): ${body.slice(0, 180)}` };
    }

    const json = (await res.json()) as { choices?: GatewayChoice[] };
    const choice = json.choices?.[0];
    const chunk = choice?.message?.content ?? "";
    if (chunk) {
      text = text ? text + chunk : chunk;
    }

    const cut = choice?.finish_reason === "length";
    if (!cut) {
      truncated = false;
      break;
    }
    truncated = true;
    if (!chunk) break;
    messages.push({ role: "assistant", content: chunk });
    messages.push({
      role: "user",
      content:
        "Continue exatamente de onde parou, sem repetir o que já foi escrito e sem reintroduzir o resumo.",
    });
  }

  const final = fixGluedBlocks(text).trim();
  if (!final) return { ok: false, message: "A IA não retornou conteúdo." };
  return { ok: true, text: final, truncated };
}

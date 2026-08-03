export type WeekCaseInput = { summary: string | null; resolution: string | null };

export const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
export const MODEL = "google/gemini-3.6-flash";
export const MAX_TOKENS = 8000;
/** Máximo de caracteres do bloco de casos enviado ao modelo. */
export const MAX_INPUT_CHARS = 60_000;
const MAX_FIELD_CHARS = 600;
/** Quantas chamadas de continuação são permitidas quando a resposta é cortada. */
export const MAX_CONTINUATIONS = 3;

const PROMPT_HEAD = `Você é um analista de suporte técnico da Cloudia (plataforma de chatbot para clínicas). Abaixo estão os casos resolvidos esta semana pelo time de suporte.

Gere um resumo executivo em português (markdown) com:
1. Panorama geral da semana (principais categorias de problemas)
2. Os 3 a 5 principais problemas que apareceram: o que era e como foi resolvido
3. Pontos de atenção que o time de atendimento deveria saber ou melhorar

Seja direto e técnico. Sem introduções longas. Escreva o resumo COMPLETO, terminando todas as seções. Será usado em reuniões internas.

Casos:
`;

function clip(value: string | null, max = MAX_FIELD_CHARS) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function buildCasesBlock(cases: WeekCaseInput[]): string {
  const lines: string[] = [];
  let total = 0;
  for (const c of cases) {
    const line = `- Problema: ${clip(c.summary)} | Resolução: ${clip(c.resolution)}`;
    if (total + line.length + 1 > MAX_INPUT_CHARS) break;
    total += line.length + 1;
    lines.push(line);
  }
  return lines.join("\n");
}

export function buildPrompt(cases: WeekCaseInput[]): string {
  return PROMPT_HEAD + buildCasesBlock(cases);
}

type ChatMessage = { role: "user" | "assistant"; content: string };

type GatewayChoice = {
  message?: { content?: string };
  finish_reason?: string | null;
};

export type SummaryResult =
  | { ok: true; text: string; truncated: boolean }
  | { ok: false; message: string };

export async function generateSummaryText(
  cases: WeekCaseInput[],
  key: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SummaryResult> {
  if (!cases.length) return { ok: false, message: "Nenhum caso resolvido nesta semana." };

  const messages: ChatMessage[] = [{ role: "user", content: buildPrompt(cases) }];
  let text = "";
  let truncated = false;

  for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt++) {
    const res = await fetchImpl(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, messages }),
    });

    if (!res.ok) {
      if (text) return { ok: true, text, truncated: true };
      const body = await res.text().catch(() => "");
      if (res.status === 429)
        return { ok: false, message: "Limite de requisições atingido. Tente novamente em instantes." };
      if (res.status === 402)
        return { ok: false, message: "Créditos de IA esgotados. Adicione créditos no workspace." };
      return { ok: false, message: `Erro da IA (${res.status}): ${body.slice(0, 180)}` };
    }

    const json = (await res.json()) as { choices?: GatewayChoice[] };
    const choice = json.choices?.[0];
    const chunk = choice?.message?.content ?? "";
    if (chunk) {
      text = text ? `${text.replace(/\s+$/, "")}${/^\s/.test(chunk) ? "" : ""}${chunk}` : chunk;
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

  const final = text.trim();
  if (!final) return { ok: false, message: "A IA não retornou conteúdo." };
  return { ok: true, text: final, truncated };
}

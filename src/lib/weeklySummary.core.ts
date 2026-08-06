export type WeekCaseInput = { summary: string | null; resolution: string | null };

export const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
export const MODEL = "google/gemini-3.6-flash";
export const MAX_TOKENS = 8000;
/** Máximo de caracteres do bloco de casos enviado ao modelo. */
export const MAX_INPUT_CHARS = 60_000;
const MAX_FIELD_CHARS = 600;
/** Quantas chamadas de continuação são permitidas quando a resposta é cortada. */
export const MAX_CONTINUATIONS = 3;

const PROMPT_HEAD = `Você é um analista de suporte técnico sênior da Cloudia, uma plataforma de chatbot para clínicas. Você recebe abaixo os casos resolvidos pelo time de suporte na última semana (problema relatado + resolução aplicada).

Gere um boletim semanal em português, em markdown, para uma reunião interna com o time de atendimento (N1/N2), que nem sempre tem background técnico.

REGRA DE OURO — LINGUAGEM ACESSÍVEL:
Sempre que usar um termo técnico (ex: token, webhook, API, deploy, delay, integração, cache, endpoint, string, payload), explique o que ele significa em poucas palavras, entre parênteses ou numa frase simples, como se estivesse explicando para alguém do atendimento. Nunca deixe uma sigla ou jargão sem explicação na primeira vez que aparecer. Exemplo: "o token (senha de acesso que conecta a Cloudia ao sistema da clínica) estava vencido".

REGRAS DE CONTEÚDO:
- Use APENAS informações presentes nos casos abaixo. Não invente números de ticket, nomes de ferramentas/integrações ou causas que não estejam explícitas no texto.
- Se um caso mencionar nome de paciente, clínica específica ou outro dado pessoal identificável, NÃO reproduza — generalize (ex: "uma clínica relatou...").
- Se não houver informação suficiente para preencher alguma seção como no modelo, encurte a seção em vez de inventar conteúdo.
- Escreva o boletim COMPLETO, terminando todas as seções.

Estruture a resposta EXATAMENTE assim (markdown):

# 🚀 Relatório Semanal: Suporte Avançado Cloudia
**Foco da semana:** [uma linha resumindo os 2-3 temas que mais apareceram, em linguagem simples]

---

## 🌟 Os 3 Destaques da Semana (O que você precisa saber)
Escolha os problemas mais frequentes ou de maior impacto (2 a 3 itens). Para cada um:
1.  **[Título curto e simples do problema]:** Explique o que estava acontecendo, em linguagem que qualquer pessoa do atendimento entenda. **Ação:** o que foi feito para resolver, também em linguagem simples.

---

## 📊 Panorama Geral: Onde o time atuou
*Nesta semana, os esforços se concentraram nas seguintes áreas:*

Liste as categorias identificadas nos casos (use as que fizerem sentido, com um emoji e contagem aproximada), por exemplo:
*   🤖 **Comportamento da IA (Nx):** [descrição simples]
*   🔗 **Integrações com outros sistemas (Nx):** [descrição simples]
*   ⚙️ **Automações (Nx):** [descrição simples]
*   📅 **Agenda/Cadastro (Nx):** [descrição simples]
*   💰 **Cobrança (Nx):** [descrição simples]
*   🖥️ **Estabilidade da plataforma (Nx):** [descrição simples]
(Omita categorias sem casos correspondentes.)

---

## ✅ O que foi resolvido e como melhorar (Direto ao ponto)
Tabela com 3 a 6 dos problemas mais relevantes:

| Problema | O que fizemos | Dica para o Time (N1/N2) |
| :--- | :--- | :--- |
| **[nome simples do problema]** | [o que foi feito, em linguagem acessível] | [dica prática e objetiva, o que fazer da próxima vez] |

---

## ⚠️ Atenção, Time! (Boas Práticas)
Liste de 2 a 5 recomendações objetivas e acionáveis, priorizando problemas recorrentes. Cada uma deve dizer exatamente o que fazer, sem jargão não explicado:
*   **[situação]:** [o que fazer].

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

import { createServerFn } from "@tanstack/react-start";

export type WeekCaseInput = { summary: string | null; resolution: string | null };

const PROMPT_HEAD = `Você é um analista de suporte técnico da Cloudia (plataforma de chatbot para clínicas). Abaixo estão os casos resolvidos esta semana pelo time de suporte.

Gere um resumo executivo em português com:
1. Panorama geral da semana (principais categorias de problemas)
2. Os 3 a 5 principais problemas que apareceram: o que era e como foi resolvido
3. Pontos de atenção que o time de atendimento deveria saber ou melhorar

Seja direto e técnico. Sem introduções longas. Será usado em reuniões internas.

Casos:
`;

export const generateWeeklySummary = createServerFn({ method: "POST" })
  .inputValidator((input: { cases: WeekCaseInput[] }) => input)
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) {
      return { ok: false as const, message: "LOVABLE_API_KEY não configurada no servidor." };
    }

    const lines = data.cases
      .slice(0, 400)
      .map((c) => `- Problema: ${c.summary ?? "—"} | Resolução: ${c.resolution ?? "—"}`)
      .join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        max_tokens: 1000,
        messages: [{ role: "user", content: PROMPT_HEAD + lines }],
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      if (res.status === 429) {
        return { ok: false as const, message: "Limite de requisições atingido. Tente novamente em instantes." };
      }
      if (res.status === 402) {
        return { ok: false as const, message: "Créditos de IA esgotados. Adicione créditos no workspace." };
      }
      return { ok: false as const, message: `Erro da IA (${res.status}): ${txt.slice(0, 180)}` };
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) return { ok: false as const, message: "A IA não retornou conteúdo." };
    return { ok: true as const, text };
  });

import { createServerFn } from "@tanstack/react-start";
import { generateSummaryText, type WeekCaseInput, type WeekMeta } from "@/lib/weeklySummary.core";

export type { WeekCaseInput, WeekMeta };

export const generateWeeklySummary = createServerFn({ method: "POST" })
  .inputValidator((input: { cases: WeekCaseInput[]; meta?: Partial<WeekMeta> }) => input)
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) {
      return { ok: false as const, message: "LOVABLE_API_KEY não configurada no servidor." };
    }
    const meta: WeekMeta = {
      periodLabel: data.meta?.periodLabel?.trim() || "período não informado",
      escalationChannel:
        data.meta?.escalationChannel?.trim() || "canal de escalonamento do time avançado",
    };
    const result = await generateSummaryText(data.cases, key, meta);
    if (!result.ok) return { ok: false as const, message: result.message };
    return { ok: true as const, text: result.text };
  });

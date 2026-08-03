import { createServerFn } from "@tanstack/react-start";
import { generateSummaryText, type WeekCaseInput } from "@/lib/weeklySummary.core";

export type { WeekCaseInput };

export const generateWeeklySummary = createServerFn({ method: "POST" })
  .inputValidator((input: { cases: WeekCaseInput[] }) => input)
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) {
      return { ok: false as const, message: "LOVABLE_API_KEY não configurada no servidor." };
    }
    const result = await generateSummaryText(data.cases, key);
    if (!result.ok) return { ok: false as const, message: result.message };
    return { ok: true as const, text: result.text };
  });

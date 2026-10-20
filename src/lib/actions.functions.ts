import { createServerFn } from "@tanstack/react-start";
import { SUPABASE_URL } from "./supabase";
import { isTestCase } from "./discord";
import {
  formatPeriodLabel,
  generateSummaryText,
  MODEL as SUMMARY_MODEL,
} from "./weeklySummary.core";
import { isoWeekKey } from "./sla";
import {
  issueToken,
  openRouterKey,
  requireRole,
  serviceClient,
  serviceKey,
  type Role,
} from "./server/session";

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

function fail(err: unknown): { ok: false; message: string } {
  return { ok: false, message: err instanceof Error ? err.message : String(err) };
}

export const login = createServerFn({ method: "POST" })
  .validator((input: { role: Role; password: string }) => input)
  .handler(async ({ data }): Promise<Result<{ token: string; role: Role }>> => {
    try {
      const token = await issueToken(data.role, data.password);
      if (!token) return { ok: false, message: "Senha incorreta." };
      return { ok: true, token, role: token.split(".")[0] as Role };
    } catch (e) {
      return fail(e);
    }
  });

/** Roda a IA num caso (função analyze-case do Supabase, com a chave de serviço). */
export const analyzeCase = createServerFn({ method: "POST" })
  .validator((input: { token: string; caseId: number }) => input)
  .handler(async ({ data }): Promise<Result> => {
    try {
      await requireRole(data.token, "admin");
      const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-case`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey()}` },
        body: JSON.stringify({ case_id: data.caseId }),
      });
      if (!res.ok)
        return {
          ok: false,
          message: `Análise falhou (${res.status}): ${(await res.text()).slice(0, 200)}`,
        };
      return { ok: true };
    } catch (e) {
      return fail(e);
    }
  });

export const saveFeedback = createServerFn({ method: "POST" })
  .validator(
    (input: {
      token: string;
      caseId: number;
      rating: "aprovado" | "corrigido";
      reason?: string;
      comment?: string;
      reviewer: string;
    }) => input,
  )
  .handler(async ({ data }): Promise<Result> => {
    try {
      await requireRole(data.token, "admin");
      const { error } = await serviceClient()
        .from("analysis_feedback")
        .insert({
          case_id: data.caseId,
          rating: data.rating,
          reason: data.reason || null,
          comment: data.comment?.trim() || null,
          reviewer: data.reviewer,
        });
      if (error) return { ok: false, message: error.message };
      return { ok: true };
    } catch (e) {
      return fail(e);
    }
  });

/** Gera o boletim de uma semana (segunda a domingo, Brasília) e salva no banco. */
export const generateWeekly = createServerFn({ method: "POST" })
  .validator((input: { token: string; weekStart: string }) => input)
  .handler(async ({ data }): Promise<Result<{ text: string; weekKey: string }>> => {
    try {
      await requireRole(data.token, "admin");
      const start = new Date(data.weekStart);
      const end = new Date(start.getTime() + 7 * 24 * 3600_000);
      const db = serviceClient();
      const { data: rows, error } = await db
        .from("cases")
        .select("thread_title, analyses(summary, resolution)")
        .in("status", ["fechado", "resolvido"])
        .eq("archived", false)
        .gte("closed_at", start.toISOString())
        .lt("closed_at", end.toISOString())
        .limit(2000);
      if (error) return { ok: false, message: error.message };

      type Row = {
        thread_title: string | null;
        analyses: { summary: string | null; resolution: string | null } | null;
      };
      const cases = ((rows || []) as unknown as Row[])
        .filter((r) => !isTestCase(r) && r.analyses?.summary)
        .map((r) => ({ summary: r.analyses!.summary, resolution: r.analyses!.resolution }));

      const periodLabel = formatPeriodLabel(start, new Date(end.getTime() - 3600_000));
      const result = await generateSummaryText(cases, openRouterKey(), {
        periodLabel,
        escalationChannel: "canal do Suporte Avançado no Discord",
      });
      if (!result.ok) return { ok: false, message: result.message };

      const weekKey = isoWeekKey(start);
      const { error: saveError } = await db.from("weekly_summaries").upsert({
        week_key: weekKey,
        content: { text: result.text, periodLabel, total: cases.length },
        model: SUMMARY_MODEL,
        generated_at: new Date().toISOString(),
      });
      if (saveError) return { ok: false, message: saveError.message };
      return { ok: true, text: result.text, weekKey };
    } catch (e) {
      return fail(e);
    }
  });

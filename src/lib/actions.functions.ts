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

export type Rating = {
  case_id: number;
  rater_name: string | null;
  resolver_name: string | null;
  resolver_team: string | null;
  score: number | null;
  comment: string | null;
  status: "enviada" | "respondida" | "falhou";
  sent_at: string;
  answered_at: string | null;
  expires_at: string;
  cases: { thread_title: string | null; idclinic: string | null } | null;
};

/** Avaliações enviadas num período. Notas não são públicas: só Coordenação e Admin. */
export const loadRatings = createServerFn({ method: "POST" })
  .validator((input: { token: string; from: string; to: string }) => input)
  .handler(async ({ data }): Promise<Result<{ rows: Rating[] }>> => {
    try {
      await requireRole(data.token, "coord");
      const { data: rows, error } = await serviceClient()
        .from("case_ratings")
        .select(
          "case_id, rater_name, resolver_name, resolver_team, score, comment, status, sent_at, answered_at, expires_at, cases(thread_title, idclinic)",
        )
        .gte("sent_at", data.from)
        .lt("sent_at", data.to)
        .order("sent_at", { ascending: false })
        .limit(2000);
      if (error) return { ok: false, message: error.message };
      return { ok: true, rows: (rows || []) as unknown as Rating[] };
    } catch (e) {
      return fail(e);
    }
  });

/** Avaliação de um caso (ou null). Só com sessão de Coordenação/Admin. */
export const loadCaseRating = createServerFn({ method: "POST" })
  .validator((input: { token: string; caseId: number }) => input)
  .handler(async ({ data }): Promise<Result<{ rating: Rating | null }>> => {
    try {
      await requireRole(data.token, "coord");
      const { data: row, error } = await serviceClient()
        .from("case_ratings")
        .select(
          "case_id, rater_name, resolver_name, resolver_team, score, comment, status, sent_at, answered_at, expires_at, cases(thread_title, idclinic)",
        )
        .eq("case_id", data.caseId)
        .maybeSingle();
      if (error) return { ok: false, message: error.message };
      return { ok: true, rating: (row as unknown as Rating) ?? null };
    } catch (e) {
      return fail(e);
    }
  });

export type PanelFeedback = {
  id: number;
  name: string;
  email: string;
  score: number;
  screen: string | null;
  good: string | null;
  improve: string | null;
  created_at: string;
};

const SCREENS = ["Hoje", "Casos", "Problemas que voltam", "Ainda não usei"];
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Feedback do painel (rota /feedbacksupavancado). Aberto, uma resposta por e-mail. */
export const sendPanelFeedback = createServerFn({ method: "POST" })
  .validator(
    (input: {
      /** Token do login Google: o e-mail sai dele, não do formulário. */
      token: string;
      name: string;
      score: number;
      screen?: string;
      good?: string;
      improve?: string;
    }) => input,
  )
  .handler(async ({ data }): Promise<Result<{ already?: boolean }>> => {
    try {
      const { data: auth } = await serviceClient().auth.getUser(clean(data.token, 4000));
      const email = (auth.user?.email ?? "").toLowerCase();
      if (auth.user?.app_metadata?.provider !== "google" || !email.endsWith("@cloudia.com.br"))
        return { ok: false, message: "Entre com o seu Google @cloudia.com.br para responder." };
      const name = clean(data.name, 120);
      const score = Number(data.score);
      if (name.length < 2) return { ok: false, message: "Escreva seu nome." };
      if (!(score >= 1 && score <= 5)) return { ok: false, message: "Escolha uma nota de 1 a 5." };
      const screen = SCREENS.includes(clean(data.screen, 60)) ? clean(data.screen, 60) : null;
      const { error } = await serviceClient()
        .from("panel_feedback")
        .insert({
          name,
          email,
          score,
          screen,
          good: clean(data.good, 1500) || null,
          improve: clean(data.improve, 1500) || null,
        });
      if (error) {
        if (/duplicate|unique/i.test(error.message)) return { ok: true, already: true };
        return { ok: false, message: "Não consegui salvar agora. Tente de novo em instantes." };
      }
      return { ok: true };
    } catch (e) {
      return fail(e);
    }
  });

/** Todas as respostas de feedback do painel. Só Admin. */
export const loadPanelFeedback = createServerFn({ method: "POST" })
  .validator((input: { token: string }) => input)
  .handler(async ({ data }): Promise<Result<{ rows: PanelFeedback[] }>> => {
    try {
      await requireRole(data.token, "admin");
      const { data: rows, error } = await serviceClient()
        .from("panel_feedback")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) return { ok: false, message: error.message };
      return { ok: true, rows: (rows || []) as PanelFeedback[] };
    } catch (e) {
      return fail(e);
    }
  });

// Consultas do painel. Cada tela pede só o que mostra: casos abertos, um período ou um mês.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  supabase,
  fetchAllPages,
  type Analysis,
  type Case,
  type CaseWithAnalysis,
  type Feedback,
  type Message,
  type WeeklySummary,
} from "./supabase";
import { isTestCase } from "./discord";

type LoadState<T> = { data: T | null; loading: boolean; error: string | null; reload: () => void };

/** Carrega dados e recarrega sozinho quando as tabelas mudam (tempo real, com folga de 1,5 s). */
export function useLoader<T>(
  load: () => Promise<T>,
  deps: unknown[],
  realtimeTables: string[] = [],
): LoadState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  const seq = useRef(0);

  const run = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const result = await loadRef.current();
      if (id === seq.current) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (id === seq.current) setError(e instanceof Error ? e.message : "Erro ao carregar dados");
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const tablesKey = realtimeTables.join(",");
  useEffect(() => {
    if (!tablesKey) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase.channel(`sa2-${tablesKey}-${Math.random().toString(36).slice(2)}`);
    for (const table of tablesKey.split(",")) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        clearTimeout(timer);
        timer = setTimeout(run, 1500);
      });
    }
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [tablesKey, run]);

  return { data, loading, error, reload: run };
}

const notTest = <T extends { thread_title: string | null }>(rows: T[]) =>
  rows.filter((r) => !isTestCase(r));

const LIGHT_ANALYSIS =
  "analyses(problem_label, problem_fingerprint, subcategory, category, first_response_minutes, waiting_for, resolver_team)";
export type LightCase = Case & {
  analyses: Pick<
    Analysis,
    | "problem_label"
    | "problem_fingerprint"
    | "subcategory"
    | "category"
    | "first_response_minutes"
    | "waiting_for"
    | "resolver_team"
  > | null;
};

export type MessageLite = Pick<
  Message,
  "case_id" | "author_username" | "content" | "is_bot" | "sent_at"
> &
  Partial<Message>;

/** Casos abertos (fora os arquivados) com análise e mensagens, para a fila de Hoje. */
export async function loadOpenBoard() {
  const cases = notTest(
    await fetchAllPages<CaseWithAnalysis>((from, to) =>
      supabase
        .from("cases")
        .select("*, analyses(*)")
        .eq("status", "aberto")
        .eq("archived", false)
        .order("last_activity_at", { ascending: false })
        .range(from, to),
    ),
  );
  const ids = cases.map((c) => c.id);
  const messages: MessageLite[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    messages.push(
      ...(await fetchAllPages<MessageLite>((from, to) =>
        supabase
          .from("messages")
          .select("case_id, author_username, content, is_bot, sent_at")
          .in("case_id", chunk)
          .order("sent_at")
          .range(from, to),
      )),
    );
  }
  const byCase = new Map<number, MessageLite[]>();
  for (const m of messages) {
    const list = byCase.get(m.case_id) ?? [];
    list.push(m);
    byCase.set(m.case_id, list);
  }
  return { cases, messagesByCase: byCase };
}

/** Casos abertos num período (leve: sem mensagens). */
export async function loadCasesOpenedBetween(from: Date, to: Date): Promise<LightCase[]> {
  return notTest(
    await fetchAllPages<LightCase>((a, b) =>
      supabase
        .from("cases")
        .select(`*, ${LIGHT_ANALYSIS}`)
        .eq("archived", false)
        .gte("opened_at", from.toISOString())
        .lt("opened_at", to.toISOString())
        .order("opened_at", { ascending: false })
        .range(a, b),
    ),
  );
}

/** Casos fechados num período (base do PDI e dos resolvidos da semana). */
export async function loadCasesClosedBetween(from: Date, to: Date): Promise<LightCase[]> {
  return notTest(
    await fetchAllPages<LightCase>((a, b) =>
      supabase
        .from("cases")
        .select(`*, ${LIGHT_ANALYSIS}`)
        .eq("archived", false)
        .in("status", ["fechado", "resolvido"])
        .gte("closed_at", from.toISOString())
        .lt("closed_at", to.toISOString())
        .order("closed_at", { ascending: false })
        .range(a, b),
    ),
  );
}

export type CaseFilters = {
  q?: string;
  status?: "abertos" | "todos" | "resolvidos" | "parados" | "semretorno";
  prioridade?: "P1" | "P2" | "P3";
  /** "sem" = sem tag de área nem de pessoa (o antigo "unassigned"). */
  area?: "N2" | "Chatbot" | "AM" | "sem";
  /** Categoria da análise da IA (Bug, Configuração, Dúvida…). */
  categoria?: string;
  idclinic?: string;
  problema?: string;
  pessoa?: string;
  de?: string;
  ate?: string;
  pagina?: number;
  /** Restringe a estes casos (usado pelo filtro "parados", que depende das mensagens). */
  ids?: number[];
};

export const PAGE_SIZE = 50;

/** Lista de casos com filtros, paginada no banco. A busca também procura no texto das mensagens. */
export async function loadCasesPage(f: CaseFilters, all = false) {
  let messageCaseIds: number[] | null = null;
  const q = f.q?.trim();
  if (q) {
    const { data } = await supabase
      .from("messages")
      .select("case_id")
      .ilike("content", `%${q}%`)
      .limit(500);
    messageCaseIds = [...new Set((data || []).map((m: { case_id: number }) => m.case_id))];
  }

  let query = supabase
    .from("cases")
    .select(f.problema || f.categoria ? "*, analyses!inner(*)" : "*, analyses(*)", {
      count: "exact",
    })
    .eq("archived", false);

  if (f.status === "abertos" || f.status === "parados") query = query.eq("status", "aberto");
  if (f.status === "resolvidos") query = query.in("status", ["fechado", "resolvido"]);
  if (f.status === "semretorno") query = query.eq("no_response", true);
  if (f.prioridade) query = query.eq("priority", f.prioridade);
  if (f.area === "sem") query = query.eq("area_tags", "{}").eq("person_tags", "{}");
  else if (f.area) query = query.contains("area_tags", [f.area]);
  if (f.pessoa) query = query.contains("person_tags", [f.pessoa]);
  if (f.idclinic) query = query.eq("idclinic", f.idclinic);
  if (f.ids) query = query.in("id", f.ids.length ? f.ids : [0]);
  if (f.problema) query = query.eq("analyses.problem_fingerprint", f.problema);
  if (f.categoria) query = query.ilike("analyses.category", f.categoria);
  if (f.de) query = query.gte("opened_at", new Date(`${f.de}T00:00:00-03:00`).toISOString());
  if (f.ate)
    query = query.lt(
      "opened_at",
      new Date(new Date(`${f.ate}T00:00:00-03:00`).getTime() + 86_400_000).toISOString(),
    );
  if (q) {
    const safe = q.replace(/[,()%]/g, " ");
    const ors = [`thread_title.ilike.%${safe}%`, `idclinic.eq.${safe.replace(/\D/g, "") || "0"}`];
    if (messageCaseIds?.length) ors.push(`id.in.(${messageCaseIds.join(",")})`);
    query = query.or(ors.join(","));
  }
  query = query.order("last_activity_at", { ascending: false });

  if (all) {
    const rows = await fetchAllPages<CaseWithAnalysis>((a, b) => query.range(a, b) as never, 5000);
    return { rows: notTest(rows), count: rows.length };
  }
  const page = Math.max(1, f.pagina ?? 1);
  const { data, count, error } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  return { rows: notTest((data || []) as unknown as CaseWithAnalysis[]), count: count ?? 0 };
}

export async function loadCaseDetail(id: number) {
  const [{ data: c, error }, { data: msgs }] = await Promise.all([
    supabase.from("cases").select("*, analyses(*)").eq("id", id).single(),
    supabase.from("messages").select("*").eq("case_id", id).eq("is_bot", false).order("sent_at"),
  ]);
  if (error) throw new Error(error.message);
  return { case: c as CaseWithAnalysis, messages: (msgs || []) as Message[] };
}

/** Análises ainda sem validação, mais recentes primeiro. */
export async function loadValidationQueue() {
  const { data: fb } = await supabase.from("analysis_feedback").select("case_id");
  const done = new Set((fb || []).map((f: { case_id: number }) => f.case_id));
  const rows = await fetchAllPages<CaseWithAnalysis>((a, b) =>
    supabase
      .from("cases")
      .select("*, analyses!inner(*)")
      .eq("archived", false)
      .order("last_activity_at", { ascending: false })
      .range(a, b),
  );
  return notTest(rows).filter((r) => r.analyses && !done.has(r.id));
}

export async function loadFeedbacks() {
  return fetchAllPages<
    Feedback & { cases: { thread_title: string | null; idclinic: string | null } | null }
  >((a, b) =>
    supabase
      .from("analysis_feedback")
      .select("*, cases(thread_title, idclinic)")
      .order("created_at", { ascending: false })
      .range(a, b),
  );
}

export async function loadWeeklySummaries() {
  const { data, error } = await supabase
    .from("weekly_summaries")
    .select("*")
    .order("week_key", { ascending: false })
    .limit(52);
  if (error) throw new Error(error.message);
  return (data || []) as WeeklySummary[];
}

/** Casos sem análise da IA (para "Analisar pendentes"). */
export async function loadUnanalyzedCaseIds(onlyOpen = false): Promise<number[]> {
  const rows = await fetchAllPages<{
    id: number;
    thread_title: string | null;
    analyses: { case_id: number } | null;
  }>((a, b) => {
    let q = supabase
      .from("cases")
      .select("id, thread_title, analyses(case_id)")
      .eq("archived", false);
    if (onlyOpen) q = q.eq("status", "aberto");
    return q.order("id").range(a, b);
  });
  return notTest(rows)
    .filter((r) => !r.analyses)
    .map((r) => r.id);
}

export async function loadOpenCaseIds(): Promise<number[]> {
  const rows = await fetchAllPages<{ id: number; thread_title: string | null }>((a, b) =>
    supabase
      .from("cases")
      .select("id, thread_title")
      .eq("archived", false)
      .eq("status", "aberto")
      .order("id")
      .range(a, b),
  );
  return notTest(rows).map((r) => r.id);
}

/** Sinais de vida do bot: última mensagem gravada e último tópico sincronizado. */
export async function loadBotHealth() {
  const [{ data: m }, { data: t }, { count }] = await Promise.all([
    supabase.from("messages").select("sent_at").order("sent_at", { ascending: false }).limit(1),
    supabase
      .from("threads")
      .select("last_synced_at")
      .order("last_synced_at", { ascending: false })
      .limit(1),
    supabase.from("threads").select("thread_id", { count: "exact", head: true }),
  ]);
  return {
    lastMessageAt: (m?.[0] as { sent_at: string } | undefined)?.sent_at ?? null,
    lastSyncAt: (t?.[0] as { last_synced_at: string } | undefined)?.last_synced_at ?? null,
    threads: count ?? 0,
  };
}

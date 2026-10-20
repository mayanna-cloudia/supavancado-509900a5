import { createClient } from "@supabase/supabase-js";

// Banco do Suporte Avançado 2.0. A chave anon é pública por desenho: só lê (RLS).
// Escritas passam pelas server functions, com a chave de serviço guardada nos secrets.
export const SUPABASE_URL = "https://mqrotynkjxfknlqppwna.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xcm90eW5ranhma25scXBwd25hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NzMwODgsImV4cCI6MjEwODA0OTA4OH0.202i_OpRCjyS58zQipB-kQl8xou9AcyzdVHsh0KF4zo";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 10 } },
});

export type Priority = "P1" | "P2" | "P3";
export type CaseStatus = "aberto" | "fechado" | "resolvido";
export type WaitingFor = "team_n2" | "team_chatbot" | "team_am" | "client" | "none";

export type Case = {
  id: number;
  thread_id: string;
  thread_title: string | null;
  idclinic: string | null;
  case_number: number;
  priority: Priority | null;
  person_tags: string[];
  area_tags: string[];
  status: CaseStatus;
  archived: boolean;
  opened_at: string;
  closed_at: string | null;
  last_activity_at: string;
  sla_alerts_sent: string[];
  /** Lembretes enviados a quem abriu o tópico (follow-up do bot). */
  followups_sent?: string[];
  /** Fechado pelo bot por falta de retorno de quem abriu o tópico. */
  no_response?: boolean;
  no_response_at?: string | null;
};

export type Attachment = {
  filename: string;
  content_type: string | null;
  size_bytes: number | null;
};

export type Message = {
  id: number;
  case_id: number;
  message_id: string;
  message_url: string | null;
  author_username: string | null;
  content: string | null;
  attachments: Attachment[] | null;
  is_bot: boolean;
  sent_at: string;
};

export type Analysis = {
  case_id: number;
  category: string | null;
  subcategory: string | null;
  summary: string | null;
  resolution: string | null;
  resolved: boolean | null;
  resolver_username: string | null;
  resolver_name: string | null;
  resolver_team: string | null;
  first_response_minutes: number | null;
  first_responder_name: string | null;
  first_responder_team: string | null;
  problem_label: string | null;
  problem_fingerprint: string | null;
  waiting_for: WaitingFor | null;
  model: string | null;
  analyzed_at: string;
};

export type Feedback = {
  id: number;
  case_id: number;
  rating: "aprovado" | "corrigido";
  reason: string | null;
  comment: string | null;
  reviewer: string;
  created_at: string;
};

export type WeeklySummary = {
  week_key: string;
  content: { text: string; periodLabel: string; total: number };
  model: string | null;
  generated_at: string;
};

/** Caso com a análise da IA embutida (select "*, analyses(*)"). */
export type CaseWithAnalysis = Case & { analyses: Analysis | null };

/** Lê todas as páginas de uma consulta (o PostgREST devolve no máximo 1000 por vez). */
// Sem tipos gerados do banco, o supabase-js acha que relação embutida vem como lista;
// o PostgREST devolve objeto quando a chave é única (analyses.case_id). Por isso o cast para T.
export async function fetchAllPages<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  max = 20_000,
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    if (!rows.length) break;
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

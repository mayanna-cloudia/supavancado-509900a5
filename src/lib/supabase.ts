import { createClient } from "@supabase/supabase-js";

// Public anon key - safe to expose client-side. Backend already exists.
const SUPABASE_URL = "https://drnxnqguyqndmozmovxu.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRybnhucWd1eXFuZG1vem1vdnh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NDI0OTMsImV4cCI6MjA5MjAxODQ5M30.mhyxQMMlyJYZHYr_K-uMKyD3wqHMgxtmTZEd8RhCnFE";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 10 } },
});

export const ANALYZE_FN_URL = `${SUPABASE_URL}/functions/v1/analyze-case`;
export const SUPABASE_ANON = SUPABASE_ANON_KEY;

// ---- Types ----
export type Thread = {
  thread_id: string | number;
  title: string | null;
  idclinic: string | null;
  created_at: string;
  archived: boolean | null;
};

export type Case = {
  id: number;
  thread_id: string | number;
  thread_title: string | null;
  idclinic: string | null;
  case_number: number | null;
  opened_at: string;
  closed_at: string | null;
  last_activity_at: string | null;
  status: string | null;
  /** Discord-tag priority (P1/P2/P3). Source of truth — IA never sets priority. */
  priority?: string | null;
};

export type Message = {
  id?: number;
  case_id: number;
  author_username: string;
  content: string | null;
  sent_at: string;
  attachments: unknown;
};

export type Analysis = {
  id?: number;
  case_id: number;
  category: string | null;
  subcategory: string | null;
  priority: string | null;
  summary: string | null;
  resolution: string | null;
  resolved: boolean | null;
  resolver_name: string | null;
  resolver_team: string | null;
  analyzed_at: string;
  first_response_minutes?: number | null;
  problem_fingerprint?: string | null;
  problem_label?: string | null;
  first_responder_username?: string | null;
  first_responder_name?: string | null;
  first_responder_team?: string | null;
};

export type CaseRow = Case & {
  analysis?: Analysis | null;
  messages_count?: number;
  first_response_minutes?: number | null;
};
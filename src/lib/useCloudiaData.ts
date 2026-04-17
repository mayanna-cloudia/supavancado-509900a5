import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase, type Case, type Analysis, type Message, type CaseRow } from "./supabase";
import { diffMinutes } from "./format";

type State = {
  cases: Case[];
  analyses: Record<number, Analysis>; // by case_id (latest)
  messages: Record<number, Message[]>; // by case_id
  loading: boolean;
  lastEvent: number; // timestamp of last realtime event
  error: string | null;
};

const PAGE = 1000;

async function fetchAll<T>(table: string, order: string): Promise<T[]> {
  let from = 0;
  const out: T[] = [];
  // safety cap 20k rows
  for (let i = 0; i < 20; i++) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order(order, { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

export function useCloudiaData() {
  const [state, setState] = useState<State>({
    cases: [],
    analyses: {},
    messages: {},
    loading: true,
    lastEvent: 0,
    error: null,
  });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const [cases, analyses, messages] = await Promise.all([
        fetchAll<Case>("cases", "opened_at"),
        fetchAll<Analysis>("analyses", "analyzed_at"),
        fetchAll<Message>("messages", "sent_at"),
      ]);

      // Keep latest analysis per case_id
      const aMap: Record<number, Analysis> = {};
      for (const a of analyses) {
        const prev = aMap[a.case_id];
        if (!prev || new Date(a.analyzed_at) > new Date(prev.analyzed_at)) {
          aMap[a.case_id] = a;
        }
      }

      const mMap: Record<number, Message[]> = {};
      for (const m of messages) {
        if (!mMap[m.case_id]) mMap[m.case_id] = [];
        mMap[m.case_id].push(m);
      }
      // sort messages ascending by sent_at
      for (const k of Object.keys(mMap)) {
        mMap[+k].sort((x, y) => new Date(x.sent_at).getTime() - new Date(y.sent_at).getTime());
      }

      setState({
        cases,
        analyses: aMap,
        messages: mMap,
        loading: false,
        lastEvent: Date.now(),
        error: null,
      });
    } catch (e: unknown) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : "Erro ao carregar dados",
      }));
    }
  }, []);

  useEffect(() => {
    refresh();

    const ch = supabase
      .channel("cloudia-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "cases" }, (payload) => {
        setState((s) => {
          const next = { ...s, lastEvent: Date.now() };
          const row = payload.new as Case | undefined;
          const old = payload.old as Case | undefined;
          if (payload.eventType === "DELETE" && old) {
            next.cases = s.cases.filter((c) => c.id !== old.id);
          } else if (row) {
            const idx = s.cases.findIndex((c) => c.id === row.id);
            if (idx >= 0) {
              next.cases = [...s.cases];
              next.cases[idx] = row;
            } else {
              next.cases = [row, ...s.cases];
            }
          }
          return next;
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "analyses" }, (payload) => {
        setState((s) => {
          const row = payload.new as Analysis | undefined;
          if (!row) return { ...s, lastEvent: Date.now() };
          const prev = s.analyses[row.case_id];
          if (prev && new Date(prev.analyzed_at) >= new Date(row.analyzed_at)) {
            return { ...s, lastEvent: Date.now() };
          }
          return {
            ...s,
            analyses: { ...s.analyses, [row.case_id]: row },
            lastEvent: Date.now(),
          };
        });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const row = payload.new as Message | undefined;
        if (!row) return;
        setState((s) => {
          const list = s.messages[row.case_id] || [];
          return {
            ...s,
            messages: { ...s.messages, [row.case_id]: [...list, row] },
            lastEvent: Date.now(),
          };
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [refresh]);

  // Build CaseRow[] enriched with analysis + first response
  const rows = useMemo<CaseRow[]>(() => {
    return state.cases.map((c) => {
      const analysis = state.analyses[c.id] || null;
      const msgs = state.messages[c.id] || [];
      // first response = first message NOT from the case opener
      let firstResponse: number | null = null;
      const opener = msgs[0]?.author_username;
      if (opener) {
        const reply = msgs.find((m) => m.author_username !== opener);
        if (reply) firstResponse = diffMinutes(c.opened_at, reply.sent_at);
      }
      return {
        ...c,
        analysis,
        messages_count: msgs.length,
        first_response_minutes: firstResponse,
      };
    });
  }, [state.cases, state.analyses, state.messages]);

  return { ...state, rows, refresh };
}

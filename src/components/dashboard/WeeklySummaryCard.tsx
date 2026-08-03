import { useEffect, useMemo, useState } from "react";
import { supabase, type Case, type Analysis } from "@/lib/supabase";
import { isTestCase } from "@/lib/discord";
import { fmtDate } from "@/lib/format";
import { generateWeeklySummary } from "@/lib/weeklySummary.functions";
import { Sparkles, Loader2, RefreshCw, CalendarDays, ChevronDown } from "lucide-react";
import { toast } from "sonner";

type WeekGroup = {
  key: string; // 2026-W31
  start: Date;
  end: Date;
  cases: { summary: string | null; resolution: string | null }[];
};

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (x.getDay() + 6) % 7; // 0 = monday
  x.setDate(x.getDate() - day);
  return x;
}

function isoWeekKey(monday: Date): string {
  const thursday = new Date(monday);
  thursday.setDate(monday.getDate() + 3);
  const year = thursday.getFullYear();
  const firstThursday = new Date(year, 0, 4);
  const firstMonday = startOfWeekMonday(firstThursday);
  const week = Math.round((monday.getTime() - firstMonday.getTime()) / (7 * 86400000)) + 1;
  return `${year}-${String(week).padStart(2, "0")}`;
}

async function fetchAllPaged<T>(
  table: string,
  select: string,
  apply: (q: ReturnType<typeof supabase.from>) => unknown,
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; from < 40000; from += PAGE) {
    let q = supabase.from(table).select(select).range(from, from + PAGE - 1);
    q = apply(q as never) as typeof q;
    const { data, error } = await q;
    if (error) throw error;
    const batch = (data as T[]) || [];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

export function WeeklySummaryCard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weeks, setWeeks] = useState<WeekGroup[]>([]);
  const [visible, setVisible] = useState(3);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [cases, analyses] = await Promise.all([
          fetchAllPaged<Case>("cases", "id,thread_title,opened_at,closed_at,last_activity_at", (q) =>
            (q as never as ReturnType<typeof supabase.from>).order("id", { ascending: true } as never),
          ),
          fetchAllPaged<Analysis>(
            "analyses",
            "case_id,summary,resolution,resolved,analyzed_at",
            (q) => (q as never as { eq: (a: string, b: unknown) => unknown }).eq("resolved", true),
          ),
        ]);

        const caseMap = new Map<number, Case>();
        for (const c of cases) caseMap.set(c.id, c);

        // latest resolved analysis per case
        const latest = new Map<number, Analysis>();
        for (const a of analyses) {
          const prev = latest.get(a.case_id);
          if (!prev || new Date(a.analyzed_at) > new Date(prev.analyzed_at)) latest.set(a.case_id, a);
        }

        const groups = new Map<string, WeekGroup>();
        for (const [caseId, a] of latest) {
          const c = caseMap.get(caseId);
          if (!c) continue;
          if (isTestCase({ thread_title: c.thread_title ?? null })) continue;
          const iso = c.closed_at || c.last_activity_at || c.opened_at;
          if (!iso) continue;
          const d = new Date(iso);
          if (isNaN(d.getTime())) continue;
          const monday = startOfWeekMonday(d);
          const key = isoWeekKey(monday);
          let g = groups.get(key);
          if (!g) {
            const end = new Date(monday);
            end.setDate(monday.getDate() + 6);
            g = { key, start: monday, end, cases: [] };
            groups.set(key, g);
          }
          g.cases.push({ summary: a.summary, resolution: a.resolution });
        }

        const list = [...groups.values()]
          .filter((g) => g.cases.length > 0)
          .sort((x, y) => y.start.getTime() - x.start.getTime());
        setWeeks(list);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao carregar casos resolvidos");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const shown = useMemo(() => weeks.slice(0, visible), [weeks, visible]);

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-md bg-[rgba(115,90,255,0.15)] flex items-center justify-center shrink-0">
          <Sparkles className="h-4 w-4" style={{ color: "#b8a8ff" }} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-medium text-foreground">Resumo da semana — gerado pela IA</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Casos resolvidos agrupados por semana. Gere um resumo executivo com os principais
            problemas e pontos de atenção. O resultado fica salvo localmente.
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Carregando casos resolvidos…
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {!loading && !error && weeks.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhum caso resolvido encontrado.</p>
      )}

      {!loading && shown.length > 0 && (
        <div className="flex flex-col gap-3">
          {shown.map((w) => (
            <WeekCard key={w.key} week={w} />
          ))}

          {visible < weeks.length && (
            <button
              type="button"
              onClick={() => setVisible((v) => v + 3)}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-3.5 py-2 text-xs font-medium text-foreground hover:bg-surface/70 transition-colors"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              Ver semanas anteriores
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function WeekCard({ week }: { week: WeekGroup }) {
  const storageKey = `admin_summary_${week.key}`;
  const [text, setText] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    try {
      setText(localStorage.getItem(storageKey));
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  async function generate() {
    setRunning(true);
    try {
      const res = await generateWeeklySummary({ data: { cases: week.cases } });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setText(res.text);
      try {
        localStorage.setItem(storageKey, res.text);
      } catch {
        /* ignore quota */
      }
      toast.success("Resumo gerado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar resumo");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-xs font-medium text-foreground tabular-nums">
          Semana de {fmtDate(week.start.toISOString(), "dd/MM")} a{" "}
          {fmtDate(week.end.toISOString(), "dd/MM")} — {week.cases.length} casos resolvidos
        </h3>
      </div>

      {!text && (
        <button
          type="button"
          onClick={generate}
          disabled={running}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#256EFF] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#1f5dd9] disabled:opacity-60 transition-colors"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {running ? "Gerando…" : "Gerar resumo com IA"}
        </button>
      )}

      {text && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Resumo executivo
            </span>
            <button
              type="button"
              onClick={generate}
              disabled={running}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-60 transition-colors"
            >
              {running ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Regenerar
            </button>
          </div>
          <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">{text}</p>
        </div>
      )}
    </div>
  );
}

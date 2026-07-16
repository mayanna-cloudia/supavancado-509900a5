import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase, type Analysis } from "@/lib/supabase";
import { discordThreadUrl } from "@/lib/discord";
import {
  ArrowLeft, Lock, Search, X, ChevronLeft, ChevronRight,
  Check, XCircle, Filter, Calendar, ExternalLink, RefreshCw, Loader2, MessageSquare,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ADMIN_PASSWORD = "May0401@";
const STORAGE_KEY = "cloudia_admin_ok";
const PAGE_SIZE = 25;

export const Route = createFileRoute("/admin-feedbacks")({
  component: AdminFeedbacksPage,
});

type Rating = "good" | "bad" | "all";
type DatePreset = "any" | "7d" | "30d" | "90d" | "custom";

type FeedbackRow = {
  id: number;
  case_id: number;
  reviewer: string;
  rating: "good" | "bad";
  reasons: string[] | null;
  comment: string | null;
  created_at: string;
};

type CaseLite = {
  id: number;
  idclinic: string | null;
  thread_title: string | null;
  thread_id: string | number;
  priority?: string | null;
};

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  function submit() {
    if (password !== ADMIN_PASSWORD) { setError("Senha incorreta."); return; }
    try { sessionStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    onLogin();
  }
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-[rgba(115,90,255,0.15)] flex items-center justify-center">
            <Lock className="h-5 w-5" style={{ color: "#b8a8ff" }} />
          </div>
        </div>
        <h1 className="text-lg font-medium text-foreground text-center mb-1">Log de feedbacks</h1>
        <p className="text-xs text-muted-foreground text-center mb-6">Acesso restrito — administração</p>
        <div className="space-y-3">
          <input
            type="password"
            placeholder="Senha"
            autoFocus
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className="w-full h-10 rounded-md border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[var(--brand-blue)]"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <button
            type="button"
            onClick={submit}
            className="w-full h-10 rounded-md bg-[#256EFF] text-white text-sm font-medium hover:bg-[#1f5dd9] transition-colors"
          >Entrar</button>
          <Link to="/admin" className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground pt-2 transition-colors">
            <ArrowLeft className="h-3 w-3" /> Voltar ao admin
          </Link>
        </div>
      </div>
    </div>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function AdminFeedbacksPage() {
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    try { if (sessionStorage.getItem(STORAGE_KEY) === "1") setAuthed(true); } catch { /* ignore */ }
  }, []);

  // Filters
  const [rating, setRating] = useState<Rating>("all");
  const [reviewer, setReviewer] = useState<string>("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("any");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  // Data
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [cases, setCases] = useState<Record<number, CaseLite>>({});
  const [total, setTotal] = useState(0);
  const [reviewerOptions, setReviewerOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setErrorMsg] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [rating, reviewer, datePreset, customFrom, customTo, debouncedSearch]);

  // Load distinct reviewers once
  useEffect(() => {
    if (!authed) return;
    (async () => {
      const { data } = await supabase
        .from("analysis_feedback")
        .select("reviewer")
        .limit(1000);
      if (!data) return;
      const set = new Set<string>();
      for (const r of data as { reviewer: string }[]) if (r.reviewer) set.add(r.reviewer);
      setReviewerOptions(Array.from(set).sort());
    })();
  }, [authed]);

  const dateBounds = useMemo(() => {
    const now = Date.now();
    if (datePreset === "7d") return { from: new Date(now - 7 * 86400000).toISOString(), to: null as string | null };
    if (datePreset === "30d") return { from: new Date(now - 30 * 86400000).toISOString(), to: null };
    if (datePreset === "90d") return { from: new Date(now - 90 * 86400000).toISOString(), to: null };
    if (datePreset === "custom") {
      return {
        from: customFrom ? new Date(customFrom + "T00:00:00").toISOString() : null,
        to: customTo ? new Date(customTo + "T23:59:59").toISOString() : null,
      };
    }
    return { from: null as string | null, to: null as string | null };
  }, [datePreset, customFrom, customTo]);

  const load = useCallback(async () => {
    if (!authed) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      // If search present, first find matching case_ids (by idclinic or thread_title)
      let caseIdsFilter: number[] | null = null;
      const q = debouncedSearch;
      if (q) {
        const isNumeric = /^\d+$/.test(q);
        const { data: caseHits } = await supabase
          .from("cases")
          .select("id")
          .or(
            [
              `idclinic.ilike.%${q}%`,
              `thread_title.ilike.%${q}%`,
              ...(isNumeric ? [`id.eq.${q}`] : []),
            ].join(",")
          )
          .limit(5000);
        caseIdsFilter = (caseHits as { id: number }[] | null)?.map((r) => r.id) ?? [];
      }

      let query = supabase
        .from("analysis_feedback")
        .select("id, case_id, reviewer, rating, reasons, comment, created_at", { count: "exact" })
        .order("created_at", { ascending: false });

      if (rating !== "all") query = query.eq("rating", rating);
      if (reviewer !== "all") query = query.eq("reviewer", reviewer);
      if (dateBounds.from) query = query.gte("created_at", dateBounds.from);
      if (dateBounds.to) query = query.lte("created_at", dateBounds.to);

      if (q) {
        // Combine case-id hits with comment ilike (OR)
        const ids = caseIdsFilter ?? [];
        const orParts: string[] = [`comment.ilike.%${q}%`];
        if (ids.length > 0) orParts.push(`case_id.in.(${ids.join(",")})`);
        query = query.or(orParts.join(","));
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count, error: qErr } = await query.range(from, to);
      if (qErr) throw qErr;
      const fbRows = (data as FeedbackRow[]) || [];
      setRows(fbRows);
      setTotal(count ?? 0);

      // Fetch case metadata for the visible rows
      const missingIds = Array.from(new Set(fbRows.map((r) => r.case_id))).filter((id) => !(id in cases));
      if (missingIds.length > 0) {
        const { data: caseData } = await supabase
          .from("cases")
          .select("id, idclinic, thread_title, thread_id, priority")
          .in("id", missingIds);
        if (caseData) {
          setCases((prev) => {
            const next = { ...prev };
            for (const c of caseData as CaseLite[]) next[c.id] = c;
            return next;
          });
        }
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Erro ao carregar feedbacks");
    } finally {
      setLoading(false);
    }
  }, [authed, rating, reviewer, dateBounds.from, dateBounds.to, debouncedSearch, page, cases]);

  useEffect(() => { load(); }, [load]);

  const handleExport = useCallback(async () => {
    if (!authed || exporting) return;
    setExporting(true);
    try {
      // Match the same filters used by load()
      let caseIdsFilter: number[] | null = null;
      const q = debouncedSearch;
      if (q) {
        const isNumeric = /^\d+$/.test(q);
        const { data: caseHits } = await supabase
          .from("cases")
          .select("id")
          .or(
            [
              `idclinic.ilike.%${q}%`,
              `thread_title.ilike.%${q}%`,
              ...(isNumeric ? [`id.eq.${q}`] : []),
            ].join(",")
          )
          .limit(5000);
        caseIdsFilter = (caseHits as { id: number }[] | null)?.map((r) => r.id) ?? [];
      }

      // Paginated fetch of ALL matching feedback rows
      const PAGE = 1000;
      const all: FeedbackRow[] = [];
      for (let i = 0; i < 30; i++) {
        let query = supabase
          .from("analysis_feedback")
          .select("id, case_id, reviewer, rating, reasons, comment, created_at")
          .order("created_at", { ascending: false });
        if (rating !== "all") query = query.eq("rating", rating);
        if (reviewer !== "all") query = query.eq("reviewer", reviewer);
        if (dateBounds.from) query = query.gte("created_at", dateBounds.from);
        if (dateBounds.to) query = query.lte("created_at", dateBounds.to);
        if (q) {
          const ids = caseIdsFilter ?? [];
          const orParts: string[] = [`comment.ilike.%${q}%`];
          if (ids.length > 0) orParts.push(`case_id.in.(${ids.join(",")})`);
          query = query.or(orParts.join(","));
        }
        const { data, error: e } = await query.range(i * PAGE, i * PAGE + PAGE - 1);
        if (e) throw e;
        const chunk = (data as FeedbackRow[]) || [];
        all.push(...chunk);
        if (chunk.length < PAGE) break;
      }

      if (all.length === 0) {
        toast("Nenhum feedback para exportar com os filtros atuais");
        return;
      }

      // Enrich with case metadata
      const uniqIds = Array.from(new Set(all.map((r) => r.case_id)));
      const caseMap: Record<number, CaseLite> = { ...cases };
      const missing = uniqIds.filter((id) => !(id in caseMap));
      if (missing.length > 0) {
        // fetch in chunks of 500
        for (let i = 0; i < missing.length; i += 500) {
          const slice = missing.slice(i, i + 500);
          const { data: cd } = await supabase
            .from("cases")
            .select("id, idclinic, thread_title, thread_id, priority")
            .in("id", slice);
          if (cd) for (const c of cd as CaseLite[]) caseMap[c.id] = c;
        }
      }

      const esc = (v: unknown) => {
        if (v == null) return "";
        let s = String(v).replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ").trim();
        if (/[",;]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const cols = ["Data", "Caso ID", "IDCLINIC", "Título", "Prioridade", "Revisor", "Rating", "Motivos", "Comentário", "URL Discord"];
      const lines = [cols.map(esc).join(",")];
      for (const r of all) {
        const c = caseMap[r.case_id];
        lines.push([
          fmtDate(r.created_at),
          String(r.case_id),
          c?.idclinic || "",
          c?.thread_title || "",
          c?.priority || "",
          r.reviewer,
          r.rating === "good" ? "Aprovado" : "Reportado",
          (r.reasons || []).join(" | "),
          r.comment || "",
          c ? discordThreadUrl(c) : "",
        ].map(esc).join(","));
      }
      const csv = lines.join("\r\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      const suffix = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
      a.href = url;
      a.download = `cloudia-analysis-feedback-${suffix}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      toast.success(`${all.length.toLocaleString("pt-BR")} feedback(s) exportados`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao exportar");
    } finally {
      setExporting(false);
    }
  }, [authed, exporting, rating, reviewer, dateBounds.from, dateBounds.to, debouncedSearch, cases]);


  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1400px] mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
          <div>
            <Link to="/admin" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2 transition-colors">
              <ArrowLeft className="h-3 w-3" /> Voltar ao admin
            </Link>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <h1 className="text-base font-medium text-foreground">Log de feedbacks</h1>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Todos os registros da tabela <code className="text-foreground/80">analysis_feedback</code>
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs text-foreground hover:bg-surface/70 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Atualizar
          </button>
        </div>

        {/* Filter bar */}
        <div className="rounded-lg border border-border bg-card p-4 mb-4 flex flex-wrap items-center gap-4">
          {/* Rating */}
          <div className="flex items-center gap-1">
            <Filter className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mr-1">Rating</span>
            {([
              { k: "all" as Rating, label: "Todos" },
              { k: "good" as Rating, label: "Aprovados" },
              { k: "bad" as Rating, label: "Reportados" },
            ]).map(({ k, label }) => (
              <button
                key={k}
                type="button"
                onClick={() => setRating(k)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors",
                  rating === k
                    ? k === "good"
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                      : k === "bad"
                        ? "bg-red-500/15 border-red-500/40 text-red-300"
                        : "bg-[#256EFF]/15 border-[#256EFF]/40 text-[#5b9eff]"
                    : "bg-transparent border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                )}
              >{label}</button>
            ))}
          </div>

          <div className="h-5 w-px bg-border" />

          {/* Reviewer */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Revisor</span>
            <select
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
              className="h-7 rounded-md border border-border bg-surface px-2 text-[11px] text-foreground focus:outline-none focus:border-[var(--brand-blue)]"
            >
              <option value="all">Todos</option>
              {reviewerOptions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="h-5 w-px bg-border" />

          {/* Date */}
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mr-1">Data</span>
            {([
              { k: "any" as DatePreset, label: "Qualquer" },
              { k: "7d" as DatePreset, label: "7d" },
              { k: "30d" as DatePreset, label: "30d" },
              { k: "90d" as DatePreset, label: "90d" },
              { k: "custom" as DatePreset, label: "Personalizado" },
            ]).map(({ k, label }) => (
              <button
                key={k}
                type="button"
                onClick={() => setDatePreset(k)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors",
                  datePreset === k
                    ? "bg-[#256EFF]/15 border-[#256EFF]/40 text-[#5b9eff]"
                    : "bg-transparent border-border text-muted-foreground hover:text-foreground"
                )}
              >{label}</button>
            ))}
          </div>

          {datePreset === "custom" && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-7 rounded-md border border-border bg-surface px-2 text-[11px] text-foreground focus:outline-none focus:border-[var(--brand-blue)]"
              />
              <span className="text-[11px] text-muted-foreground">até</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-7 rounded-md border border-border bg-surface px-2 text-[11px] text-foreground focus:outline-none focus:border-[var(--brand-blue)]"
              />
            </div>
          )}

          <div className="ml-auto text-[11px] text-muted-foreground">
            <span className="text-foreground font-medium tabular-nums">{total}</span> registro(s)
          </div>
        </div>

        {/* Search */}
        <div className="rounded-lg border border-border bg-card p-3 mb-4">
          <div className="relative max-w-xl">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por #caso, IDCLINIC, título ou comentário…"
              className="w-full h-8 pl-8 pr-8 rounded-md border border-border bg-surface text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[var(--brand-blue)]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Limpar busca"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-surface/60 border-b border-border">
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-3 py-2 font-semibold">Data</th>
                  <th className="text-left px-3 py-2 font-semibold">Caso</th>
                  <th className="text-left px-3 py-2 font-semibold">Revisor</th>
                  <th className="text-left px-3 py-2 font-semibold">Rating</th>
                  <th className="text-left px-3 py-2 font-semibold">Motivos</th>
                  <th className="text-left px-3 py-2 font-semibold">Comentário</th>
                  <th className="text-right px-3 py-2 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading && rows.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground text-xs">Carregando…</td></tr>
                ) : error ? (
                  <tr><td colSpan={7} className="text-center py-8 text-destructive text-xs">{error}</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-xs">Nenhum feedback encontrado com os filtros atuais.</td></tr>
                ) : rows.map((r) => {
                  const c = cases[r.case_id];
                  return (
                    <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-surface/30 align-top">
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums">{fmtDate(r.created_at)}</td>
                      <td className="px-3 py-2 min-w-[220px] max-w-[320px]">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border text-foreground/90">
                            #{c?.idclinic || r.case_id}
                          </span>
                          {c?.priority && (
                            <span className={cn(
                              "px-1.5 py-0.5 rounded text-[9px] font-bold border",
                              c.priority === "P3"
                                ? "bg-red-500/15 text-red-400 border-red-500/30"
                                : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                            )}>{c.priority}</span>
                          )}
                        </div>
                        <div className="text-foreground line-clamp-2">{c?.thread_title || <span className="italic text-muted-foreground">Sem título</span>}</div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-foreground">{r.reviewer}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {r.rating === "good" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                            <Check className="h-3 w-3" /> Aprovado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30 text-[10px] font-bold">
                            <XCircle className="h-3 w-3" /> Reportado
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 max-w-[220px]">
                        {r.reasons && r.reasons.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {r.reasons.map((rz) => (
                              <span key={rz} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/25">
                                {rz}
                              </span>
                            ))}
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2 max-w-[320px]">
                        {r.comment
                          ? <span className="text-foreground/90 italic line-clamp-3">"{r.comment}"</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-right">
                        {c && (
                          <a
                            href={discordThreadUrl(c)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-[10px] text-foreground/90 hover:text-white hover:border-[#256EFF]/50 hover:bg-[#256EFF]/10 transition-colors"
                            title="Abrir no Discord"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Discord
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-surface/40">
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {total === 0 ? "0" : `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, total)}`} de {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground hover:border-border/80 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-3 w-3" /> Ant.
              </button>
              <span className="text-[11px] text-muted-foreground tabular-nums">{currentPage}/{totalPages}</span>
              <button
                type="button"
                disabled={currentPage >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground hover:border-border/80 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Próx. <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { CaseRow } from "@/lib/supabase";
import {
  ThumbsUp, Lock, ArrowLeft, CheckCircle2, XCircle,
  AlertCircle, Check, Filter, ChevronDown, Calendar, Circle, CircleCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── CONSTANTES ──────────────────────────────────────────────────────────────

const PASSWORD = "May0401@";
const REVIEWER = "Mayanna" as const;
type Reviewer = typeof REVIEWER;
type Rating = "good" | "bad";

const BAD_REASONS = [
  "Resolvedor errado",
  "Categoria errada",
  "Resumo incorreto",
  "Prioridade errada",
  "Marcou como resolvido sendo que não está",
  "Marcou como aberto sendo que está resolvido",
];

type Feedback = {
  id: number;
  case_id: number;
  reviewer: Reviewer;
  rating: Rating;
  reasons: string[];
  comment: string | null;
  created_at: string;
};

type FilterType = "pending" | "all" | "good" | "bad";
type StatusFilter = "all" | "open" | "resolved";
type DateFilter = "any" | "7d" | "30d" | "90d" | "custom";

// ─── ROTA ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/feedbacks")({
  component: FeedbacksPage,
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (r: Reviewer) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit() {
    if (password !== PASSWORD) { setError("Senha incorreta."); return; }
    onLogin(REVIEWER);
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-[rgba(115,90,255,0.15)] flex items-center justify-center">
            <Lock className="h-5 w-5" style={{ color: "#b8a8ff" }} />
          </div>
        </div>
        <h1 className="text-lg font-medium text-white text-center mb-1">Área de Feedback</h1>
        <p className="text-xs text-zinc-500 text-center mb-6">Acesso restrito ao Suporte N2</p>
        <div className="space-y-3">
          <input
            type="password"
            placeholder="Senha"
            autoFocus
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className="w-full h-10 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#256EFF]"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="button"
            onClick={handleSubmit}
            className="w-full h-10 rounded-md bg-[#256EFF] text-white text-sm font-medium hover:bg-[#1e5bcc] transition-colors"
          >
            Entrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── POPUP DE REPORTE ────────────────────────────────────────────────────────

function BadReasonsModal({
  caseRow,
  existing,
  initialComment,
  onSubmit,
  onClose,
}: {
  caseRow: CaseRow;
  existing?: Feedback;
  initialComment: string;
  onSubmit: (reasons: string[], comment: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(existing?.reasons || []);
  const [comment, setComment] = useState(existing?.comment || initialComment || "");

  function toggle(reason: string) {
    setSelected((prev) => prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)" }}
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-md flex items-center justify-center bg-red-500/15">
            <AlertCircle className="h-3.5 w-3.5 text-red-400" />
          </div>
          <span className="text-sm font-medium text-white">O que está errado?</span>
        </div>

        <div className="rounded-md bg-zinc-950 border border-zinc-800 px-3 py-2 mb-4 text-xs text-zinc-400">
          <span className="font-mono font-semibold text-[#256EFF]">#{caseRow.idclinic || caseRow.id}</span>
          {" · "}
          {caseRow.thread_title || "Sem título"}
        </div>

        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-2">
          Selecione (1 ou mais)
        </p>

        <div className="flex flex-col gap-1.5 mb-4">
          {BAD_REASONS.map((reason) => (
            <label
              key={reason}
              className={cn(
                "flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border text-xs transition-colors",
                selected.includes(reason)
                  ? "bg-red-500/10 border-red-500/40 text-white"
                  : "bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700"
              )}
            >
              <input
                type="checkbox"
                checked={selected.includes(reason)}
                onChange={() => toggle(reason)}
                className="cursor-pointer accent-red-500"
              />
              {reason}
            </label>
          ))}
        </div>

        <textarea
          placeholder="Detalhe adicional (opcional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="w-full h-20 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white placeholder:text-zinc-600 resize-none focus:outline-none focus:border-[#256EFF] mb-3"
        />

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 rounded-md border border-zinc-800 bg-transparent text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onSubmit(selected, comment)}
            disabled={selected.length === 0}
            className="h-8 px-4 rounded-md bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors disabled:opacity-40"
          >
            Enviar reporte
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SIDEBAR ITEM ─────────────────────────────────────────────────────────────

function QueueItem({
  caseRow, active, feedback, onSelect,
}: { caseRow: CaseRow; active: boolean; feedback?: Feedback; onSelect: () => void }) {
  const status: null | "good" | "bad" = feedback?.rating ?? null;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left p-3.5 border-b border-zinc-800/50 transition-colors group",
        active
          ? "bg-[#256EFF10] border-l-4 border-l-[#256EFF] pl-[10px]"
          : "hover:bg-zinc-800/40 border-l-4 border-l-transparent pl-[10px]"
      )}
    >
      <div className="flex justify-between items-start mb-1 gap-2">
        <span className={cn(
          "text-[10px] font-bold uppercase tracking-wider font-mono",
          active ? "text-[#256EFF]" : "text-zinc-500 group-hover:text-zinc-400"
        )}>
          #{caseRow.idclinic || caseRow.id}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {caseRow.priority && (
            <span className={cn(
              "px-1.5 py-0.5 rounded text-[9px] font-bold border",
              caseRow.priority === "P3"
                ? "bg-red-500/15 text-red-400 border-red-500/30"
                : "bg-amber-500/15 text-amber-400 border-amber-500/30"
            )}>
              {caseRow.priority}
            </span>
          )}
          {status === "good" && <Check className="h-3 w-3 text-emerald-400" />}
          {status === "bad" && <XCircle className="h-3 w-3 text-red-400" />}
        </div>
      </div>
      <p className={cn(
        "text-sm font-medium line-clamp-1",
        active ? "text-white" : "text-zinc-300"
      )}>
        {caseRow.thread_title || "Sem título"}
      </p>
      <p className="text-[11px] text-zinc-500 mt-1 line-clamp-2">
        {caseRow.analysis?.summary || "Sem análise"}
      </p>
    </button>
  );
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────

function FeedbacksPage() {
  const [reviewer, setReviewer] = useState<Reviewer | null>(null);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterType>("pending");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("any");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [showBadModal, setShowBadModal] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (reviewer) loadData(); }, [reviewer]);

  async function loadData() {
    setLoading(true);
    const [{ data: casesData }, { data: feedbackData }] = await Promise.all([
      supabase.from("cases").select("*, analysis:analyses(*)").not("analysis", "is", null).order("opened_at", { ascending: false }).limit(2000),
      supabase.from("analysis_feedback").select("*").eq("reviewer", reviewer),
    ]);
    setCases((casesData as CaseRow[]) || []);
    setFeedbacks((feedbackData as Feedback[]) || []);
    setLoading(false);
  }

  const myFeedbackMap = useMemo(() => {
    const m = new Map<number, Feedback>();
    feedbacks.forEach((f) => m.set(f.case_id, f));
    return m;
  }, [feedbacks]);

  const stats = useMemo(() => {
    const total = cases.filter((c) => c.analysis).length;
    const validated = feedbacks.length;
    const good = feedbacks.filter((f) => f.rating === "good").length;
    const bad = feedbacks.filter((f) => f.rating === "bad").length;
    const pending = total - validated;
    const pct = validated > 0 ? Math.round((good / validated) * 100) : null;
    return { total, validated, good, bad, pending, pct };
  }, [cases, feedbacks]);

  const dateBounds = useMemo(() => {
    const now = Date.now();
    if (dateFilter === "7d") return { from: now - 7 * 86400000, to: Infinity };
    if (dateFilter === "30d") return { from: now - 30 * 86400000, to: Infinity };
    if (dateFilter === "90d") return { from: now - 90 * 86400000, to: Infinity };
    if (dateFilter === "custom") {
      const from = customFrom ? new Date(customFrom + "T00:00:00").getTime() : -Infinity;
      const to = customTo ? new Date(customTo + "T23:59:59").getTime() : Infinity;
      return { from, to };
    }
    return { from: -Infinity, to: Infinity };
  }, [dateFilter, customFrom, customTo]);

  const filtered = useMemo(() => {
    return cases.filter((c) => {
      if (!c.analysis) return false;
      const fb = myFeedbackMap.get(c.id);
      if (filter === "pending" && fb) return false;
      if (filter === "good" && fb?.rating !== "good") return false;
      if (filter === "bad" && fb?.rating !== "bad") return false;

      // Status (aberto / resolvido) — usa a análise da IA como fonte
      if (statusFilter !== "all") {
        const resolved = !!c.analysis?.resolved;
        if (statusFilter === "open" && resolved) return false;
        if (statusFilter === "resolved" && !resolved) return false;
      }

      // Data (opened_at)
      if (dateFilter !== "any") {
        const t = c.opened_at ? new Date(c.opened_at).getTime() : 0;
        if (t < dateBounds.from || t > dateBounds.to) return false;
      }
      return true;
    });
  }, [cases, myFeedbackMap, filter, statusFilter, dateFilter, dateBounds]);

  // Auto-select first
  useEffect(() => {
    if (activeId && filtered.some((c) => c.id === activeId)) return;
    setActiveId(filtered[0]?.id ?? null);
  }, [filtered, activeId]);

  const active = useMemo(() => filtered.find((c) => c.id === activeId) || null, [filtered, activeId]);
  const activeFeedback = active ? myFeedbackMap.get(active.id) : undefined;

  useEffect(() => {
    setComment(activeFeedback?.comment || "");
  }, [activeId, activeFeedback?.id]);

  const advanceToNext = useCallback(() => {
    if (!active) return;
    const idx = filtered.findIndex((c) => c.id === active.id);
    const next = filtered[idx + 1] || filtered[idx - 1] || null;
    setActiveId(next?.id ?? null);
    setComment("");
  }, [active, filtered]);

  const submitFeedback = useCallback(async (caseRow: CaseRow, rating: Rating, reasons: string[] = [], commentText = "") => {
    const existing = feedbacks.find((f) => f.case_id === caseRow.id);
    if (existing && existing.rating === rating && rating === "good") {
      // toggle off good
      await supabase.from("analysis_feedback").delete().eq("id", existing.id);
      setFeedbacks((prev) => prev.filter((f) => f.id !== existing.id));
      return;
    }
    const payload = { case_id: caseRow.id, reviewer, rating, reasons, comment: commentText || null, updated_at: new Date().toISOString() };
    if (existing) {
      await supabase.from("analysis_feedback").update(payload).eq("id", existing.id);
      setFeedbacks((prev) => prev.map((f) => f.id === existing.id ? { ...f, ...payload } as Feedback : f));
    } else {
      const { data } = await supabase.from("analysis_feedback").insert(payload).select().single();
      if (data) setFeedbacks((prev) => [...prev, data as Feedback]);
    }
  }, [feedbacks, reviewer]);

  async function approve() {
    if (!active) return;
    await submitFeedback(active, "good", [], comment);
    advanceToNext();
  }

  function openReport() {
    if (!active) return;
    setShowBadModal(true);
  }

  async function submitReport(reasons: string[], commentText: string) {
    if (!active) return;
    await submitFeedback(active, "bad", reasons, commentText);
    setShowBadModal(false);
    advanceToNext();
  }

  // Keyboard shortcuts
  useEffect(() => {
    if (!reviewer || showBadModal) return;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (e.key === "a" || e.key === "A") { e.preventDefault(); approve(); }
      else if (e.key === "r" || e.key === "R") { e.preventDefault(); openReport(); }
      else if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        const idx = filtered.findIndex((c) => c.id === activeId);
        const next = filtered[idx + 1];
        if (next) setActiveId(next.id);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        const idx = filtered.findIndex((c) => c.id === activeId);
        const prev = filtered[idx - 1];
        if (prev) setActiveId(prev.id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reviewer, showBadModal, active, filtered, activeId, comment]);

  if (!reviewer) return <LoginScreen onLogin={setReviewer} />;

  const filterLabels: Record<FilterType, string> = {
    pending: `Pendentes (${stats.pending})`,
    all: `Todos (${stats.total})`,
    good: `Aprovados (${stats.good})`,
    bad: `Reportados (${stats.bad})`,
  };

  return (
    <div className="min-h-screen bg-zinc-950 font-sans" style={{ fontFamily: "Inter, ui-sans-serif, system-ui" }}>
      <div className="max-w-[1400px] mx-auto p-4 md:p-6">

        {/* Top bar */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao dashboard
          </Link>
          <button
            type="button"
            onClick={() => setReviewer(null)}
            className="text-xs text-zinc-500 hover:text-white transition-colors"
          >
            Sair ({reviewer})
          </button>
        </div>

        {/* Main console */}
        <div className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ height: "calc(100vh - 100px)", minHeight: 600 }}>

          {/* Header */}
          <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <h1 className="text-base font-semibold text-white tracking-tight">Validação de Análises</h1>
              <span className="px-2 py-0.5 bg-zinc-800 text-zinc-400 text-[11px] font-medium rounded-full">
                {stats.pending} pendentes
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Filter dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowFilterMenu((v) => !v)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-800/50 text-xs text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors"
                >
                  <Filter className="h-3 w-3" /> {filterLabels[filter]} <ChevronDown className="h-3 w-3" />
                </button>
                {showFilterMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl overflow-hidden z-10 min-w-[180px]">
                    {(Object.keys(filterLabels) as FilterType[]).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => { setFilter(k); setShowFilterMenu(false); }}
                        className={cn(
                          "block w-full text-left px-3 py-2 text-xs transition-colors",
                          filter === k ? "bg-[#256EFF]/15 text-[#256EFF]" : "text-zinc-300 hover:bg-zinc-800"
                        )}
                      >
                        {filterLabels[k]}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Precision top-right */}
              <div className="h-8 w-px bg-zinc-800" />
              <div className="flex flex-col items-end leading-tight">
                <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">Precisão</span>
                {stats.pct !== null ? (
                  <span className="text-lg font-mono font-semibold" style={{ color: stats.pct >= 80 ? "#10b981" : stats.pct >= 60 ? "#f59e0b" : "#ef4444" }}>
                    {stats.pct}%
                  </span>
                ) : (
                  <span className="text-xs text-zinc-600">—</span>
                )}
              </div>
              <div className="text-[10px] text-zinc-500 leading-tight">
                <div><span className="text-white font-medium">{stats.validated}</span>/{stats.total}</div>
                <div className="text-emerald-400">{stats.good} 👍</div>
              </div>
            </div>
          </div>

          {/* Body split */}
          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            <div className="w-80 border-r border-zinc-800 flex flex-col bg-zinc-900/30 shrink-0">
              <div className="overflow-y-auto flex-1">
                {loading ? (
                  <p className="text-xs text-zinc-500 text-center py-8">Carregando…</p>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-12 px-4">
                    <CheckCircle2 className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                    <p className="text-xs text-zinc-400">
                      {filter === "pending" ? "Tudo validado!" : "Nenhum caso."}
                    </p>
                  </div>
                ) : (
                  filtered.map((c) => (
                    <QueueItem
                      key={c.id}
                      caseRow={c}
                      active={c.id === activeId}
                      feedback={myFeedbackMap.get(c.id)}
                      onSelect={() => setActiveId(c.id)}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Detail */}
            <div className="flex-1 flex flex-col bg-zinc-950/30 min-w-0">
              {!active ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                  <CheckCircle2 className="h-10 w-10 text-zinc-700 mb-3" />
                  <p className="text-sm text-zinc-300">Nenhum caso selecionado</p>
                  <p className="text-xs text-zinc-500 mt-1">Selecione um caso na fila ao lado.</p>
                </div>
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto p-6 md:p-8">
                    <div className="max-w-2xl mx-auto space-y-6">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 bg-zinc-800 text-[#256EFF] text-[10px] font-bold rounded font-mono">
                            #{active.idclinic || active.id}
                          </span>
                          {active.priority && (
                            <span className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-bold border",
                              active.priority === "P3"
                                ? "bg-red-500/15 text-red-400 border-red-500/30"
                                : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                            )}>
                              {active.priority}
                            </span>
                          )}
                          {active.analysis?.category && (
                            <span className="text-zinc-500 text-xs">
                              {active.analysis.category}
                              {active.analysis.subcategory && ` · ${active.analysis.subcategory}`}
                            </span>
                          )}
                          {activeFeedback && (
                            <span className={cn(
                              "ml-auto px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1",
                              activeFeedback.rating === "good"
                                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                : "bg-red-500/15 text-red-400 border-red-500/30"
                            )}>
                              {activeFeedback.rating === "good" ? <Check className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                              {activeFeedback.rating === "good" ? "Já aprovado" : "Já reportado"}
                            </span>
                          )}
                        </div>
                        <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight leading-tight">
                          {active.thread_title || "Sem título"}
                        </h2>
                      </div>

                      {active.analysis?.summary && (
                        <section>
                          <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Resumo</h3>
                          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 text-zinc-300 text-sm leading-relaxed">
                            {active.analysis.summary}
                          </div>
                        </section>
                      )}

                      <section>
                        <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Análise da IA</h3>
                        <div className="bg-zinc-800/20 border-l-2 border-[#256EFF] rounded-r-xl p-4 space-y-3">
                          {active.analysis?.resolver_name && (
                            <div>
                              <p className="text-[10px] text-[#256EFF] font-bold uppercase mb-0.5">Resolvido por</p>
                              <p className="text-white text-sm font-medium">
                                {active.analysis.resolver_name}
                                {active.analysis.resolver_team && (
                                  <span className="text-zinc-500 text-xs ml-2">· {active.analysis.resolver_team}</span>
                                )}
                              </p>
                            </div>
                          )}
                          {active.analysis?.resolution && (
                            <div>
                              <p className="text-[10px] text-[#256EFF] font-bold uppercase mb-0.5">Resolução</p>
                              <p className="text-zinc-200 text-sm leading-relaxed">{active.analysis.resolution}</p>
                            </div>
                          )}
                          <div className="flex items-center gap-4 pt-1">
                            <span className={cn(
                              "text-[10px] font-bold px-2 py-0.5 rounded",
                              active.analysis?.resolved
                                ? "bg-emerald-500/15 text-emerald-400"
                                : "bg-amber-500/15 text-amber-400"
                            )}>
                              {active.analysis?.resolved ? "RESOLVIDO" : "ABERTO"}
                            </span>
                            {active.analysis?.waiting_for && active.analysis.waiting_for !== "none" && (
                              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
                                Aguardando: <span className="text-zinc-300 font-medium">{active.analysis.waiting_for}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </section>

                      {activeFeedback?.rating === "bad" && activeFeedback.reasons.length > 0 && (
                        <section>
                          <h3 className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-2">Seu reporte anterior</h3>
                          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {activeFeedback.reasons.map((r) => (
                                <span key={r} className="text-[11px] px-2 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30">
                                  {r}
                                </span>
                              ))}
                            </div>
                            {activeFeedback.comment && (
                              <p className="text-xs italic text-zinc-400">"{activeFeedback.comment}"</p>
                            )}
                          </div>
                        </section>
                      )}
                    </div>
                  </div>

                  {/* Bottom action bar */}
                  <div className="p-5 border-t border-zinc-800 bg-zinc-900/90 backdrop-blur-xl">
                    <div className="max-w-2xl mx-auto space-y-4">
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                            Comentário
                          </label>
                          <span className="text-[10px] text-zinc-600 italic">Opcional</span>
                        </div>
                        <textarea
                          ref={textareaRef}
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder="Algo a comentar sobre esta análise? (opcional)"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-[#256EFF]/50 focus:border-[#256EFF] transition-all resize-none h-16"
                        />
                      </div>

                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-5">
                          <div className="flex items-center gap-1.5">
                            <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-400 font-mono">A</kbd>
                            <span className="text-[10px] text-zinc-500 uppercase font-bold">Aprovar</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-400 font-mono">R</kbd>
                            <span className="text-[10px] text-zinc-500 uppercase font-bold">Reportar</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-400 font-mono">↑↓</kbd>
                            <span className="text-[10px] text-zinc-500 uppercase font-bold">Navegar</span>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={openReport}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-400 transition-all font-semibold text-sm"
                          >
                            <XCircle className="w-4 h-4" />
                            Reportar erro
                          </button>
                          <button
                            type="button"
                            onClick={approve}
                            className="flex items-center gap-2 px-6 py-2 bg-[#256EFF] hover:bg-[#1e5bcc] text-white rounded-xl transition-all font-semibold text-sm shadow-lg shadow-[#256EFF]/20"
                          >
                            <ThumbsUp className="w-4 h-4" />
                            Aprovar
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {showBadModal && active && (
        <BadReasonsModal
          caseRow={active}
          existing={activeFeedback}
          initialComment={comment}
          onSubmit={submitReport}
          onClose={() => setShowBadModal(false)}
        />
      )}
    </div>
  );
}

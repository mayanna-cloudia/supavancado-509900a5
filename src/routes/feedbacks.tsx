import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import type { CaseRow } from "@/lib/supabase";
import { ThumbsUp, ThumbsDown, Lock, ArrowLeft, CheckCircle2, XCircle, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── CONSTANTES ──────────────────────────────────────────────────────────────

const PASSWORD = "May0401@";
const REVIEWERS = ["Mayanna"] as const;
type Reviewer = typeof REVIEWERS[number];
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

// ─── ROTA ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/feedbacks")({
  component: FeedbacksPage,
});

// ─── TELA DE LOGIN ────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (reviewer: Reviewer) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit() {
    if (password !== PASSWORD) { setError("Senha incorreta."); return; }
    onLogin("Mayanna");
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-[rgba(115,90,255,0.15)] flex items-center justify-center">
            <Lock className="h-5 w-5" style={{ color: "#b8a8ff" }} />
          </div>
        </div>

        <h1 className="text-lg font-medium text-foreground text-center mb-1">Área de Feedback</h1>
        <p className="text-xs text-muted-foreground text-center mb-6">Acesso restrito ao Suporte N2</p>

        <div className="space-y-3">
          <input
            type="password"
            placeholder="Senha"
            autoFocus
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className="w-full h-10 rounded-md border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[var(--brand-blue)]"
          />

          {error && <p className="text-xs text-destructive">{error}</p>}

          <button
            type="button"
            onClick={handleSubmit}
            className="w-full h-10 rounded-md bg-[#256EFF] text-white text-sm font-medium hover:bg-[#1f5dd9] transition-colors"
          >
            Entrar
          </button>
        </div>

          <input
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className="w-full h-10 rounded-md border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[var(--brand-blue)]"
          />

          {error && <p className="text-xs text-destructive">{error}</p>}

          <button
            type="button"
            onClick={handleSubmit}
            className="w-full h-10 rounded-md bg-[#256EFF] text-white text-sm font-medium hover:bg-[#1f5dd9] transition-colors"
          >
            Entrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── POPUP DE 👎 ─────────────────────────────────────────────────────────────

function BadFeedbackPopup({
  caseRow,
  existing,
  onSubmit,
  onClose,
}: {
  caseRow: CaseRow;
  existing?: Feedback;
  onSubmit: (reasons: string[], comment: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(existing?.reasons || []);
  const [comment, setComment] = useState(existing?.comment || "");

  function toggle(reason: string) {
    setSelected((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]
    );
  }

  return (
    <div
      style={{ minHeight: 400, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1.25rem", width: "100%", maxWidth: 440 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-md flex items-center justify-center bg-[rgba(239,68,68,0.15)]">
            <ThumbsDown className="h-3.5 w-3.5 text-destructive" />
          </div>
          <span className="text-sm font-medium text-foreground">O que está errado na análise?</span>
        </div>

        <div className="rounded-md bg-surface border border-border px-3 py-2 mb-4 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">#{caseRow.idclinic || caseRow.id}</span>
          {" · "}
          {caseRow.thread_title || "Sem título"}
        </div>

        <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-2">
          Selecione (1 ou mais):
        </p>

        <div className="flex flex-col gap-1.5 mb-4">
          {BAD_REASONS.map((reason) => (
            <label
              key={reason}
              className={cn(
                "flex items-center gap-2 cursor-pointer px-3 py-2 rounded-md border text-xs transition-colors",
                selected.includes(reason)
                  ? "bg-[rgba(239,68,68,0.08)] border-[rgba(239,68,68,0.3)] text-foreground"
                  : "bg-surface border-border text-foreground hover:border-border/60"
              )}
            >
              <input
                type="checkbox"
                checked={selected.includes(reason)}
                onChange={() => toggle(reason)}
                className="cursor-pointer"
              />
              {reason}
            </label>
          ))}
        </div>

        <textarea
          placeholder="Algum detalhe a mais? (opcional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="w-full h-16 rounded-md border border-border bg-surface px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-[var(--brand-blue)] mb-3"
        />

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 rounded-md border border-border bg-transparent text-xs text-foreground hover:bg-surface transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onSubmit(selected, comment)}
            disabled={selected.length === 0}
            className="h-8 px-4 rounded-md bg-destructive text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            Enviar feedback
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CARD DE CASO ─────────────────────────────────────────────────────────────

function CaseCard({
  caseRow,
  myFeedback,
  onGood,
  onBad,
}: {
  caseRow: CaseRow;
  myFeedback?: Feedback;
  onGood: () => void;
  onBad: () => void;
}) {
  const a = caseRow.analysis;
  const isGood = myFeedback?.rating === "good";
  const isBad = myFeedback?.rating === "bad";

  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-colors",
        isGood && "border-[rgba(16,185,129,0.2)] bg-[rgba(16,185,129,0.02)]",
        isBad && "border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.02)]",
        !myFeedback && "border-border bg-background"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-mono text-xs font-semibold text-[#256EFF]">
              #{caseRow.idclinic || caseRow.id}
            </span>
            <span className="text-sm text-foreground truncate">
              {caseRow.thread_title || "Sem título"}
            </span>
            {caseRow.priority && (
              <span className={cn(
                "px-1.5 py-0.5 rounded text-[10px] font-semibold border",
                caseRow.priority === "P1" && "bg-[rgba(251,146,60,0.15)] text-[#fb923c] border-[rgba(251,146,60,0.3)]",
                caseRow.priority === "P2" && "bg-[rgba(251,146,60,0.15)] text-[#fb923c] border-[rgba(251,146,60,0.3)]",
                caseRow.priority === "P3" && "bg-[rgba(239,68,68,0.15)] text-[#ef4444] border-[rgba(239,68,68,0.3)]",
              )}>
                {caseRow.priority}
              </span>
            )}
            {isGood && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[rgba(16,185,129,0.15)] text-[#10b981] border border-[rgba(16,185,129,0.3)]">
                <CheckCircle2 className="h-3 w-3" />
                Aprovado por você
              </span>
            )}
            {isBad && myFeedback?.reasons && myFeedback.reasons.length > 0 && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[rgba(239,68,68,0.15)] text-destructive border border-[rgba(239,68,68,0.3)]">
                <XCircle className="h-3 w-3" />
                {myFeedback.reasons[0]}{myFeedback.reasons.length > 1 ? ` +${myFeedback.reasons.length - 1}` : ""}
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            {a?.summary
              ? <><span className="text-foreground/80 font-medium">Resumo:</span> {a.summary}</>
              : <span className="italic">Aguardando análise</span>
            }
          </p>

          {a?.resolver_name && (
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="text-foreground/80 font-medium">Resolvido por:</span> {a.resolver_name}
              {a.category && <> · <span className="text-foreground/80 font-medium">Categoria:</span> {a.category}</>}
            </p>
          )}

          {isBad && myFeedback?.comment && (
            <p className="text-xs mt-1 italic" style={{ color: "#ef4444" }}>
              "{myFeedback.comment}"
            </p>
          )}
        </div>

        <div className="flex gap-1 shrink-0">
          <button
            type="button"
            onClick={onGood}
            title={isGood ? "Você aprovou" : "Aprovar análise"}
            className={cn(
              "w-8 h-8 rounded-md border flex items-center justify-center transition-colors",
              isGood
                ? "bg-[rgba(16,185,129,0.2)] border-[rgba(16,185,129,0.5)] text-[#10b981]"
                : "bg-surface border-border text-muted-foreground hover:text-[#10b981] hover:border-[rgba(16,185,129,0.3)]"
            )}
          >
            <ThumbsUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onBad}
            title={isBad ? "Você reportou" : "Reportar problema"}
            className={cn(
              "w-8 h-8 rounded-md border flex items-center justify-center transition-colors",
              isBad
                ? "bg-[rgba(239,68,68,0.2)] border-[rgba(239,68,68,0.5)] text-destructive"
                : "bg-surface border-border text-muted-foreground hover:text-destructive hover:border-[rgba(239,68,68,0.3)]"
            )}
          >
            <ThumbsDown className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────

function FeedbacksPage() {
  const [reviewer, setReviewer] = useState<Reviewer | null>(null);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterType>("pending");
  const [badPopup, setBadPopup] = useState<CaseRow | null>(null);

  useEffect(() => {
    if (!reviewer) return;
    loadData();
  }, [reviewer]);

  async function loadData() {
    setLoading(true);
    const [{ data: casesData }, { data: feedbackData }] = await Promise.all([
      supabase
        .from("cases")
        .select("*, analysis:analyses(*)")
        .not("analysis", "is", null)
        .order("opened_at", { ascending: false })
        .limit(2000),
      supabase
        .from("analysis_feedback")
        .select("*")
        .eq("reviewer", reviewer),
    ]);
    setCases((casesData as CaseRow[]) || []);
    setFeedbacks((feedbackData as Feedback[]) || []);
    setLoading(false);
  }

  async function submitFeedback(caseRow: CaseRow, rating: Rating, reasons: string[] = [], comment = "") {
    const existing = feedbacks.find((f) => f.case_id === caseRow.id);

    // Se clicar no mesmo rating que já estava → remove (toggle off)
    if (existing && existing.rating === rating) {
      await supabase.from("analysis_feedback").delete().eq("id", existing.id);
      setFeedbacks((prev) => prev.filter((f) => f.id !== existing.id));
      setBadPopup(null);
      return;
    }

    const payload = { case_id: caseRow.id, reviewer, rating, reasons, comment, updated_at: new Date().toISOString() };

    if (existing) {
      await supabase.from("analysis_feedback").update(payload).eq("id", existing.id);
      setFeedbacks((prev) => prev.map((f) => f.id === existing.id ? { ...f, ...payload } as Feedback : f));
    } else {
      const { data } = await supabase.from("analysis_feedback").insert(payload).select().single();
      if (data) setFeedbacks((prev) => [...prev, data as Feedback]);
    }
    setBadPopup(null);
  }

  const myFeedbackMap = useMemo(() => {
    const map = new Map<number, Feedback>();
    feedbacks.forEach((f) => map.set(f.case_id, f));
    return map;
  }, [feedbacks]);

  const stats = useMemo(() => {
    const total = cases.filter((c) => c.analysis).length;
    const validated = feedbacks.length;
    const good = feedbacks.filter((f) => f.rating === "good").length;
    const bad = feedbacks.filter((f) => f.rating === "bad").length;
    const pct = validated > 0 ? Math.round((good / validated) * 100) : null;
    return { total, validated, good, bad, pct };
  }, [cases, feedbacks]);

  const filtered = useMemo(() => {
    return cases.filter((c) => {
      if (!c.analysis) return false;
      const fb = myFeedbackMap.get(c.id);
      if (filter === "pending") return !fb;
      if (filter === "good") return fb?.rating === "good";
      if (filter === "bad") return fb?.rating === "bad";
      return true;
    });
  }, [cases, myFeedbackMap, filter]);

  if (!reviewer) return <LoginScreen onLogin={setReviewer} />;

  if (badPopup) {
    return (
      <BadFeedbackPopup
        caseRow={badPopup}
        existing={myFeedbackMap.get(badPopup.id)}
        onSubmit={(reasons, comment) => submitFeedback(badPopup, "bad", reasons, comment)}
        onClose={() => setBadPopup(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <div>
            <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3 transition-colors">
              <ArrowLeft className="h-3 w-3" />
              Voltar ao dashboard
            </Link>
            <h1 className="text-base font-medium text-foreground">Validação de Análises da IA</h1>
            <p className="text-xs text-muted-foreground">Olá, {reviewer} · Avalie a qualidade das análises</p>
          </div>

          {/* Métricas */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {stats.pct !== null && (
              <div>
                <span className="text-xl font-medium" style={{ color: stats.pct >= 80 ? "#10b981" : stats.pct >= 60 ? "#f59e0b" : "#ef4444" }}>
                  {stats.pct}%
                </span>
                {" precisão"}
              </div>
            )}
            <div>
              <span className="text-foreground font-medium">{stats.validated}</span>/{stats.total} validados
            </div>
            <button
              type="button"
              onClick={() => setReviewer(null)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
            >
              Sair
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {([
            ["pending", `Não validados (${cases.filter((c) => c.analysis && !myFeedbackMap.get(c.id)).length})`],
            ["all", `Todos (${stats.total})`],
            ["good", `👍 Aprovados (${stats.good})`],
            ["bad", `👎 Com problema (${stats.bad})`],
          ] as [FilterType, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                "h-7 px-3 rounded-md border text-xs transition-colors",
                filter === key
                  ? "bg-[#256EFF] border-transparent text-white"
                  : "bg-surface border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Lista */}
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-12">Carregando...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle2 className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-foreground/80">
              {filter === "pending" ? "Todos os casos foram validados!" : "Nenhum caso nesse filtro."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((c) => (
              <CaseCard
                key={c.id}
                caseRow={c}
                myFeedback={myFeedbackMap.get(c.id)}
                onGood={() => submitFeedback(c, "good")}
                onBad={() => setBadPopup(c)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
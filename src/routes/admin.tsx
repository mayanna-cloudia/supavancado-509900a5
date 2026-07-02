import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase, ANALYZE_FN_URL, SUPABASE_ANON, type Case, type Analysis } from "@/lib/supabase";
import { isTestCase } from "@/lib/discord";
import { Lock, ArrowLeft, Sparkles, Loader2, X, Settings, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ADMIN_PASSWORD = "May0401@";
const STORAGE_KEY = "cloudia_admin_ok";
const DELAY_MS = 1000;

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

// ─── LOGIN ────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit() {
    if (password !== ADMIN_PASSWORD) {
      setError("Senha incorreta.");
      return;
    }
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
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

        <h1 className="text-lg font-medium text-foreground text-center mb-1">Configurações</h1>
        <p className="text-xs text-muted-foreground text-center mb-6">Área restrita — administração</p>

        <div className="space-y-3">
          <input
            type="password"
            placeholder="Senha"
            value={password}
            autoFocus
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
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

          <Link
            to="/"
            className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground pt-2 transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Voltar ao dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── CONFIG PANEL ─────────────────────────────────────────────────────────
type OpenCase = Case & { hasAnalysis: boolean };

function ReanalyzeOpenCard() {
  const [loadingList, setLoadingList] = useState(true);
  const [openCases, setOpenCases] = useState<OpenCase[]>([]);
  const [includeAnalyzed, setIncludeAnalyzed] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const cancelRef = useRef(false);

  async function loadOpen() {
    setLoadingList(true);
    const [{ data: casesData }, { data: analysesData }] = await Promise.all([
      supabase.from("cases").select("*").eq("status", "aberto").limit(5000),
      supabase.from("analyses").select("case_id, summary").limit(20000),
    ]);
    const analyzedSet = new Set<number>();
    for (const a of (analysesData as Pick<Analysis, "case_id" | "summary">[]) || []) {
      if (a.summary && a.summary.trim()) analyzedSet.add(a.case_id);
    }
    const filtered = ((casesData as Case[]) || [])
      .filter((c) => !isTestCase({ thread_title: c.thread_title ?? null }))
      .map((c) => ({ ...c, hasAnalysis: analyzedSet.has(c.id) }));
    setOpenCases(filtered);
    setLoadingList(false);
  }

  useEffect(() => {
    loadOpen();
  }, []);

  const targetIds = useMemo(() => {
    return openCases
      .filter((c) => (includeAnalyzed ? true : !c.hasAnalysis))
      .map((c) => c.id);
  }, [openCases, includeAnalyzed]);

  async function start() {
    setConfirmOpen(false);
    cancelRef.current = false;
    const ids = [...targetIds];
    setTotal(ids.length);
    setDone(0);
    setRunning(true);
    let success = 0;
    let failed = 0;

    for (let i = 0; i < ids.length; i++) {
      if (cancelRef.current) break;
      try {
        const res = await fetch(ANALYZE_FN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_ANON}`,
          },
          body: JSON.stringify({ case_id: ids[i], force: true }),
        });
        if (res.ok) success++;
        else failed++;
      } catch {
        failed++;
      }
      setDone(i + 1);
      if (i < ids.length - 1 && !cancelRef.current) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }

    setRunning(false);
    if (cancelRef.current) {
      toast(`Reanálise cancelada — ${success} concluídas, ${failed} falhas`, { duration: 4000 });
    } else {
      toast.success(`${success} caso(s) reanalisados${failed ? ` · ${failed} falha(s)` : ""}`, {
        duration: 4000,
      });
    }
    loadOpen();
  }

  const withAnalysis = openCases.filter((c) => c.hasAnalysis).length;
  const withoutAnalysis = openCases.length - withAnalysis;
  const estMin = Math.ceil((targetIds.length * (DELAY_MS + 2000)) / 60000);

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-md bg-[rgba(37,110,255,0.15)] flex items-center justify-center shrink-0">
          <Sparkles className="h-4 w-4 text-[#5b9eff]" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-medium text-foreground">Reanalisar casos em aberto</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Dispara a análise da IA para todos os casos com <code className="text-foreground/80">status = aberto</code>.
            Usa <code className="text-foreground/80">force: true</code> para sobrescrever análises antigas.
          </p>
        </div>
      </div>

      {loadingList ? (
        <p className="text-xs text-muted-foreground">Carregando casos abertos…</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <Stat label="Em aberto" value={openCases.length} />
            <Stat label="Já analisados" value={withAnalysis} />
            <Stat label="Sem análise" value={withoutAnalysis} accent />
          </div>

          <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeAnalyzed}
              onChange={(e) => setIncludeAnalyzed(e.target.checked)}
              className="cursor-pointer accent-[#256EFF]"
            />
            <span className="text-xs text-foreground/90">
              Incluir casos que já possuem análise (reanalisar tudo)
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={running || targetIds.length === 0}
              onClick={() => setConfirmOpen(true)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md text-xs font-medium border transition-all",
                running || targetIds.length === 0
                  ? "bg-[#256EFF]/60 border-transparent text-white cursor-not-allowed"
                  : "bg-[#256EFF] border-transparent text-white hover:bg-[#1f5dd9]"
              )}
              style={{ padding: "8px 14px" }}
            >
              {running ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Analisando…
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Reanalisar {targetIds.length} caso(s)
                </>
              )}
            </button>

            <button
              type="button"
              onClick={loadOpen}
              disabled={running}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs text-foreground hover:bg-surface/70 transition-colors disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Atualizar lista
            </button>

            {targetIds.length > 0 && !running && (
              <span className="text-[11px] text-muted-foreground">
                ~{estMin} minuto(s) estimado(s)
              </span>
            )}
          </div>

          {/* Progress bar */}
          {running && (
            <div className="mt-4 rounded-md border border-border bg-surface p-3">
              <div className="flex items-center justify-between mb-2 gap-3">
                <span className="text-xs font-medium text-foreground tabular-nums">
                  Analisando {done}/{total}…
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {total ? Math.round((done / total) * 100) : 0}%
                  </span>
                  <button
                    type="button"
                    onClick={() => (cancelRef.current = true)}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-foreground hover:border-[var(--brand-red)]/60 hover:text-[var(--brand-red)] transition-colors"
                  >
                    <X className="h-3 w-3" />
                    Cancelar
                  </button>
                </div>
              </div>
              <div className="h-1 rounded-full bg-background overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${total ? (done / total) * 100 : 0}%`,
                    background: "var(--brand-blue)",
                  }}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Confirm modal */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-border bg-card p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-medium text-foreground mb-1">
              Reanalisar {targetIds.length} caso(s)?
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              A IA será chamada 1x por caso, com 1s de intervalo. Análises anteriores serão
              sobrescritas (<code>force: true</code>). Você pode cancelar a qualquer momento.
              Tempo estimado: <span className="text-foreground tabular-nums">~{estMin} min</span>.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="h-8 px-3 rounded-md border border-border bg-surface text-xs text-foreground hover:bg-surface/70"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={start}
                className="h-8 px-4 rounded-md bg-[#256EFF] text-white text-xs font-medium hover:bg-[#1f5dd9]"
              >
                Iniciar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p
        className={cn("text-lg font-medium tabular-nums", accent ? "text-[#5b9eff]" : "text-foreground")}
      >
        {value}
      </p>
    </div>
  );
}

// ─── PAGE ─────────────────────────────────────────────────────────────────
function AdminPage() {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === "1") setAuthed(true);
    } catch {
      /* ignore */
    }
  }, []);

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;

  function logout() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setAuthed(false);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <div>
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3 transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Voltar ao dashboard
            </Link>
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              <h1 className="text-base font-medium text-foreground">Configurações</h1>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ferramentas administrativas do dashboard
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
          >
            Sair
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <ReanalyzeOpenCard />
        </div>
      </div>
    </div>
  );
}

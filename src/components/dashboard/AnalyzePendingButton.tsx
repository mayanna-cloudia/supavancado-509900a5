import { useMemo, useRef, useState } from "react";
import { Sparkles, Loader2, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ANALYZE_FN_URL, SUPABASE_ANON, type CaseRow } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Props = {
  rows: CaseRow[];
  onDone?: () => void;
};

const DELAY_MS = 1000;

function isPending(r: CaseRow): boolean {
  if (!r.analysis) return true;
  if (!r.analysis.summary || !r.analysis.summary.trim()) return true;
  return false;
}

export function AnalyzePendingButton({ rows, onDone }: Props) {
  const pendingIds = useMemo(() => rows.filter(isPending).map((r) => r.id), [rows]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const cancelRef = useRef(false);

  const allAnalyzed = pendingIds.length === 0;

  const start = async () => {
    setConfirmOpen(false);
    cancelRef.current = false;
    const ids = [...pendingIds];
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
          body: JSON.stringify({ case_id: ids[i] }),
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
    onDone?.();
    if (cancelRef.current) {
      toast(`Análise cancelada — ${success} concluídas, ${failed} falhas`, { duration: 4000 });
    } else {
      toast.success(`${success} caso(s) analisados${failed ? ` · ${failed} falha(s)` : ""}`, {
        duration: 4000,
        style: {
          background: "var(--card)",
          border: "1px solid color-mix(in oklab, var(--brand-green) 50%, transparent)",
          color: "var(--foreground)",
        },
      });
    }
  };

  const cancel = () => {
    cancelRef.current = true;
  };

  return (
    <>
      <button
        type="button"
        disabled={allAnalyzed || running}
        onClick={() => setConfirmOpen(true)}
        aria-label={allAnalyzed ? "Todos os casos analisados" : `Analisar ${pendingIds.length} casos pendentes com IA`}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md text-[12px] font-medium border transition-all duration-200",
          allAnalyzed
            ? "bg-surface/60 border-border text-muted-foreground cursor-default"
            : running
              ? "bg-[#256EFF]/70 border-transparent text-white cursor-wait"
              : "bg-[#256EFF] border-transparent text-white hover:bg-[#1f5dd9]"
        )}
        style={{ padding: "6px 14px" }}
      >
        {running ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Analisando…
          </>
        ) : allAnalyzed ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5" />
            Tudo analisado
          </>
        ) : (
          <>
            <Sparkles className="h-3.5 w-3.5" />
            Analisar pendentes ({pendingIds.length})
          </>
        )}
      </button>

      {/* Progress bar fixed at top */}
      {running && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-card border-b border-border shadow-lg">
          <div className="mx-auto max-w-[1600px] px-4 py-2 flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--brand-blue)] shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="text-xs font-medium text-foreground tabular-nums">
                  Analisando {done}/{total} casos…
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {total ? Math.round((done / total) * 100) : 0}%
                </span>
              </div>
              <div className="h-1 rounded-full bg-surface overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-200"
                  style={{
                    width: `${total ? (done / total) * 100 : 0}%`,
                    background: "var(--brand-blue)",
                  }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={cancel}
              aria-label="Cancelar análise"
              className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-surface/70 hover:border-[var(--brand-red)]/60 hover:text-[var(--brand-red)] transition-colors"
            >
              <X className="h-3 w-3" />
              Cancelar
            </button>
          </div>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">
              Analisar {pendingIds.length} casos pendentes?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A análise será feita um caso por vez, com 1 segundo de intervalo entre cada chamada
              à IA. O processo pode levar aproximadamente{" "}
              <span className="text-foreground font-medium tabular-nums">
                {Math.ceil((pendingIds.length * (DELAY_MS + 2000)) / 60000)} minuto(s)
              </span>
              . Você pode cancelar a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-surface border-border hover:bg-surface/70">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={start}
              className="bg-[#256EFF] text-white hover:bg-[#1f5dd9] border-0"
            >
              Iniciar análise
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

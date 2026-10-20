import { Play, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cancelJob, dismissJob, resumeJob, useJob, type JobStatus } from "@/lib/jobs";
import { fmtWhen } from "@/lib/sla";

const STATUS: Record<JobStatus, { label: string; pill: string; dot: string }> = {
  running: {
    label: "EM ANDAMENTO",
    pill: "bg-yellow-bg text-yellow",
    dot: "bg-[#e0b000] ring-[#f5d76e]",
  },
  done: { label: "CONCLUÍDO", pill: "bg-green-bg text-green", dot: "bg-[#55c720] ring-[#b7ec9c]" },
  canceled: {
    label: "CANCELADO",
    pill: "bg-hover text-muted-foreground",
    dot: "bg-[#9aa0a6] ring-[#d5d8dc]",
  },
  interrupted: {
    label: "INTERROMPIDO",
    pill: "bg-orange-bg text-orange",
    dot: "bg-[#d9711c] ring-[#f5b98a]",
  },
};

/** Aviso da fila de análises. Fica em todas as telas enquanto houver uma fila. */
export function JobBanner() {
  const job = useJob();
  // Re-render a cada 30 s para a previsão de término não ficar parada
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!job) return null;

  const s = STATUS[job.status];
  const pct = job.total ? Math.round((job.done / job.total) * 100) : 0;
  const eta =
    job.status === "running" && job.avgMs
      ? new Date(Date.now() + job.remaining.length * job.avgMs)
      : null;

  return (
    <section aria-live="polite" className="card flex flex-col gap-3 px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="m-0 text-base font-bold">{job.label}</h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${s.pill}`}
        >
          {s.label}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className={`h-3.5 w-3.5 shrink-0 rounded-full ring-4 ${s.dot}`} aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap justify-between gap-2 text-[13px]">
            <span className="font-medium">Progresso</span>
            <span className="tabular-nums">
              {job.done} de {job.total} casos ({pct}%)
              {job.errors ? ` · ${job.errors} com erro` : ""}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-bar">
            <div
              className="h-full rounded-full bg-[#6b7a90] transition-[width] duration-500"
              style={{ width: `${Math.max(pct, 1)}%` }}
            />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
        <div className="text-[12.5px] italic text-muted-foreground">
          Iniciado por <b>{job.startedBy}</b> em{" "}
          <b>{fmtWhen(new Date(job.startedAt).toISOString())}</b>
          {eta && (
            <>
              {" "}
              · Terminará em: <b>{fmtWhen(eta.toISOString())}</b>
            </>
          )}
          {job.finishedAt && job.status !== "running" && (
            <>
              {" "}
              · {job.status === "done" ? "Terminou" : "Parou"} em{" "}
              <b>{fmtWhen(new Date(job.finishedAt).toISOString())}</b>
            </>
          )}
          {job.status === "interrupted" && (
            <>
              {" "}
              · A página foi recarregada ou a sessão expirou. Faltam {job.remaining.length} casos.
            </>
          )}
        </div>
        <div className="flex gap-2">
          {job.status === "running" && (
            <button
              type="button"
              onClick={cancelJob}
              className="flex h-8 items-center gap-1.5 rounded-md bg-[#e53935] px-3 text-[13px] font-bold text-white"
            >
              <X className="h-3.5 w-3.5" /> Cancelar
            </button>
          )}
          {job.status === "interrupted" && (
            <button
              type="button"
              onClick={resumeJob}
              className="flex h-8 items-center gap-1.5 rounded-md bg-[#3760ff] px-3 text-[13px] font-bold text-white"
            >
              <Play className="h-3.5 w-3.5" /> Continuar de onde parou
            </button>
          )}
          {job.status !== "running" && (
            <button
              type="button"
              onClick={dismissJob}
              className="h-8 rounded-md border border-border bg-card px-3 text-[13px]"
            >
              Fechar aviso
            </button>
          )}
        </div>
      </div>
      {job.lastError && job.errors > 0 && (
        <div className="text-[12px] text-red">Último erro: {job.lastError}</div>
      )}
    </section>
  );
}

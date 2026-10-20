// Fila de análises da IA que sobrevive à troca de aba e de tela.
// Roda no navegador (uma por vez, com 1 s de pausa) e guarda o andamento no localStorage:
// se a página for recarregada, o aviso mostra "interrompida" e dá para continuar de onde parou.
import { useSyncExternalStore } from "react";
import { analyzeCase } from "./actions.functions";
import { sessionToken } from "@/components/shell/RequireAccess";

export type JobStatus = "running" | "done" | "canceled" | "interrupted";

export type Job = {
  label: string;
  status: JobStatus;
  total: number;
  done: number;
  errors: number;
  remaining: number[];
  startedBy: string;
  startedAt: number;
  finishedAt: number | null;
  /** Tempo médio por caso, para a previsão de término. */
  avgMs: number;
  lastError: string | null;
};

const KEY = "sa2_job";
const PAUSE_MS = 1000;
const listeners = new Set<() => void>();
let job: Job | null = load();
let running = false;
let cancelRequested = false;

function load(): Job | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Job;
    // Estava rodando quando a página fechou: o laço morreu junto
    if (j.status === "running") j.status = "interrupted";
    return j;
  } catch {
    return null;
  }
}

function save() {
  try {
    if (job) localStorage.setItem(KEY, JSON.stringify(job));
    else localStorage.removeItem(KEY);
  } catch {
    /* sem storage: o aviso vale só enquanto a página estiver aberta */
  }
  listeners.forEach((l) => l());
}

function update(patch: Partial<Job>) {
  if (!job) return;
  job = { ...job, ...patch };
  save();
}

async function loop() {
  if (running || !job) return;
  running = true;
  cancelRequested = false;
  try {
    while (job && job.remaining.length && !cancelRequested) {
      const id = job.remaining[0];
      const t0 = Date.now();
      const res = await analyzeCase({ data: { token: sessionToken(), caseId: id } });
      if (!job) break;
      const elapsed = Date.now() - t0 + PAUSE_MS;
      const done = job.done + 1;
      update({
        remaining: job.remaining.slice(1),
        done,
        errors: job.errors + (res.ok ? 0 : 1),
        lastError: res.ok ? job.lastError : res.message,
        avgMs: job.avgMs ? (job.avgMs * (done - 1) + elapsed) / done : elapsed,
      });
      if (!res.ok && /Sessão/.test(res.message)) {
        // Sessão do admin expirou: para e deixa continuar depois de entrar de novo
        update({ status: "interrupted" });
        return;
      }
      await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
    if (job) update({ status: cancelRequested ? "canceled" : "done", finishedAt: Date.now() });
  } finally {
    running = false;
  }
}

/** Começa uma fila nova. Não começa se já houver uma rodando. */
export function startJob(label: string, ids: number[], startedBy: string): boolean {
  if (running || !ids.length) return false;
  job = {
    label,
    status: "running",
    total: ids.length,
    done: 0,
    errors: 0,
    remaining: ids,
    startedBy,
    startedAt: Date.now(),
    finishedAt: null,
    avgMs: 0,
    lastError: null,
  };
  save();
  void loop();
  return true;
}

/** Continua uma fila interrompida (página recarregada ou sessão expirada). */
export function resumeJob() {
  if (!job || running || !job.remaining.length) return;
  update({ status: "running", finishedAt: null });
  void loop();
}

export function cancelJob() {
  if (running) cancelRequested = true;
  else if (job && job.status !== "done") update({ status: "canceled", finishedAt: Date.now() });
}

/** Tira o aviso da tela (só quando não está rodando). */
export function dismissJob() {
  if (running) return;
  job = null;
  save();
}

export const isJobRunning = () => running;

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    // Outra aba mexeu na fila: só reflete aqui se esta aba não está rodando nada
    if (!running) job = load();
    cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useJob(): Job | null {
  return useSyncExternalStore(
    subscribe,
    () => job,
    () => null,
  );
}

// Avisa antes de fechar ou recarregar a aba com a fila rodando
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    if (running) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

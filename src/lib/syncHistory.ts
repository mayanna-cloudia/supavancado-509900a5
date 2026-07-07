// Histórico local de sincronizações com o Discord.
// Persistido em localStorage até que uma edge function real esteja em produção
// e possa gravar em uma tabela `discord_sync_runs`.

const KEY = "cloudia_discord_sync_runs";
const MAX_RUNS = 20;

export type SyncRun = {
  id: string;
  started_at: string;
  finished_at: string;
  threads_checked: number;
  cases_archived: number;
  errors: number;
  status: "success" | "partial" | "failed" | "cancelled";
};

export function loadSyncRuns(): SyncRun[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SyncRun[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function pushSyncRun(run: Omit<SyncRun, "id">): SyncRun {
  const entry: SyncRun = { id: crypto.randomUUID(), ...run };
  const list = [entry, ...loadSyncRuns()].slice(0, MAX_RUNS);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore quota */
  }
  return entry;
}

export function clearSyncRuns() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

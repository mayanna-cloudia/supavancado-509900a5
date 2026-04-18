import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, Clock, Trophy, CheckCircle2 } from "lucide-react";
import type { CaseRow, Message } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { fmtDuration, fmtDate } from "@/lib/format";
import { lookupMember, normalizeResolverTeam, AREA_BADGE, type Area } from "@/lib/team";

function isOpen(r: CaseRow): boolean {
  const s = (r.status || "").toLowerCase();
  if (s === "aberto") return true;
  // fallback: not resolved by analysis and no closed_at
  if (s === "resolvido" || s === "fechado" || s === "closed") return false;
  return !r.analysis?.resolved && !r.closed_at;
}

function lastActivityIso(r: CaseRow, msgs: Record<number, Message[]>): string | null {
  const list = msgs[r.id];
  if (list && list.length) {
    return list[list.length - 1].sent_at;
  }
  return r.last_activity_at || r.opened_at || null;
}

function MetricSection({
  icon: Icon,
  title,
  subtitle,
  children,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="glass-card overflow-hidden fade-in">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-surface/40">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ background: `color-mix(in oklab, ${accent} 18%, transparent)`, color: accent }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

// ---------- Section 1: Recurrence by problem_fingerprint ----------
function RecurrenceSection({ rows, onRowClick }: { rows: CaseRow[]; onRowClick: (r: CaseRow) => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, CaseRow[]>();
    for (const r of rows) {
      const fp = r.analysis?.problem_fingerprint;
      if (!fp) continue;
      if (!map.has(fp)) map.set(fp, []);
      map.get(fp)!.push(r);
    }
    return Array.from(map.entries())
      .map(([fp, list]) => ({ fp, list, count: list.length }))
      .filter((g) => g.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [rows]);

  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (fp: string) => setOpen((o) => ({ ...o, [fp]: !o[fp] }));

  const max = groups[0]?.count || 1;

  return (
    <MetricSection
      icon={AlertTriangle}
      title="Reincidência de Problemas"
      subtitle="Top 10 fingerprints mais reportados (≥ 2 ocorrências)"
      accent="var(--brand-orange)"
    >
      {groups.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
          Nenhum problema reincidente identificado.
        </div>
      ) : (
        <div className="divide-y divide-border/40">
          {groups.map((g, i) => {
            const expanded = !!open[g.fp];
            const sample = g.list[0]?.analysis;
            return (
              <div key={g.fp}>
                <button
                  onClick={() => toggle(g.fp)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-surface/40 transition-colors text-left"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface text-xs font-mono font-semibold text-muted-foreground">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-foreground/90 truncate" title={g.fp}>
                        {g.fp}
                      </span>
                      {sample?.category && (
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-surface px-1.5 py-0.5 rounded">
                          {sample.category}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-surface overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${(g.count / max) * 100}%`,
                          background: "var(--brand-orange)",
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-display text-2xl font-semibold tabular-nums text-[var(--brand-orange)]">
                      {g.count}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">casos</span>
                    {expanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>
                {expanded && (
                  <div className="bg-background/60 px-5 py-3 border-t border-border/40">
                    <div className="overflow-x-auto scrollbar-thin">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                            <th className="py-1.5 pr-3 font-medium">IDCLINIC</th>
                            <th className="py-1.5 pr-3 font-medium">Título</th>
                            <th className="py-1.5 pr-3 font-medium">Aberto</th>
                            <th className="py-1.5 pr-3 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.list.map((r) => {
                            const resolved = !!r.analysis?.resolved;
                            return (
                              <tr
                                key={r.id}
                                onClick={() => onRowClick(r)}
                                className="border-t border-border/30 hover:bg-surface/40 cursor-pointer"
                              >
                                <td className="py-2 pr-3 font-mono text-foreground/90">{r.idclinic || "—"}</td>
                                <td className="py-2 pr-3 max-w-[420px] truncate text-foreground/80" title={r.thread_title || ""}>
                                  {r.thread_title || "(sem título)"}
                                </td>
                                <td className="py-2 pr-3 text-muted-foreground tabular-nums">{fmtDate(r.opened_at)}</td>
                                <td className="py-2 pr-3">
                                  <span
                                    className={cn(
                                      "px-1.5 py-0.5 rounded text-[10px] font-semibold border",
                                      resolved
                                        ? "bg-[var(--brand-green)]/15 text-[var(--brand-green)] border-[var(--brand-green)]/40"
                                        : "bg-[var(--brand-orange)]/15 text-[var(--brand-orange)] border-[var(--brand-orange)]/40"
                                    )}
                                  >
                                    {resolved ? "Resolvido" : "Aberto"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </MetricSection>
  );
}

// ---------- Section 2: Time waiting for response ----------
function WaitingSection({
  rows,
  messagesMap,
  onRowClick,
}: {
  rows: CaseRow[];
  messagesMap: Record<number, Message[]>;
  onRowClick: (r: CaseRow) => void;
}) {
  const now = Date.now();
  const list = useMemo(() => {
    return rows
      .filter(isOpen)
      .map((r) => {
        const lastIso = lastActivityIso(r, messagesMap);
        const lastTs = lastIso ? new Date(lastIso).getTime() : null;
        const waitingMin = lastTs ? Math.max(0, (now - lastTs) / 60000) : null;
        return { row: r, waitingMin, lastIso };
      })
      .filter((x) => x.waitingMin != null)
      .sort((a, b) => (b.waitingMin as number) - (a.waitingMin as number))
      .slice(0, 100);
  }, [rows, messagesMap, now]);

  const colorFor = (m: number): string => {
    if (m > 60) return "var(--brand-red)";
    if (m > 30) return "var(--brand-yellow)";
    return "var(--brand-green)";
  };

  return (
    <MetricSection
      icon={Clock}
      title="Tempo Aguardando Atendimento"
      subtitle="Casos em aberto ordenados pelo tempo desde a última mensagem"
      accent="var(--brand-yellow)"
    >
      {list.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
          Nenhum caso em aberto aguardando atendimento.
        </div>
      ) : (
        <div className="overflow-x-auto scrollbar-thin max-h-[480px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card border-b border-border">
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">IDCLINIC</th>
                <th className="px-4 py-2 font-medium">Título</th>
                <th className="px-3 py-2 font-medium">Última atividade</th>
                <th className="px-3 py-2 font-medium text-right">Aguardando</th>
              </tr>
            </thead>
            <tbody>
              {list.map(({ row: r, waitingMin, lastIso }) => {
                const color = colorFor(waitingMin as number);
                return (
                  <tr
                    key={r.id}
                    onClick={() => onRowClick(r)}
                    className="border-b border-border/30 hover:bg-surface/40 cursor-pointer"
                  >
                    <td className="px-4 py-2 font-mono text-xs text-foreground/90">{r.idclinic || "—"}</td>
                    <td className="px-4 py-2 max-w-[420px] truncate text-foreground/90" title={r.thread_title || ""}>
                      {r.thread_title || "(sem título)"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                      {fmtDate(lastIso)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold border tabular-nums"
                        style={{
                          color,
                          background: `color-mix(in oklab, ${color} 14%, transparent)`,
                          borderColor: `color-mix(in oklab, ${color} 45%, transparent)`,
                        }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full pulse-dot"
                          style={{ background: color }}
                        />
                        {fmtDuration(waitingMin as number)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </MetricSection>
  );
}

// ---------- Section 3: First-responder vs Resolver ranking ----------
type RankItem = { key: string; name: string; area: Area | null; count: number };

function buildRanking(
  rows: CaseRow[],
  pick: (a: NonNullable<CaseRow["analysis"]>) => { name: string | null | undefined; team: string | null | undefined } | null,
): RankItem[] {
  const map = new Map<string, RankItem>();
  for (const r of rows) {
    if (!r.analysis) continue;
    const got = pick(r.analysis);
    if (!got || !got.name) continue;
    const member = lookupMember(got.name);
    const area = normalizeResolverTeam(got.team) || member.area;
    const key = got.name;
    if (!map.has(key)) {
      map.set(key, { key, name: member.name, area, count: 0 });
    }
    map.get(key)!.count += 1;
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

function RankingTable({
  icon: Icon,
  title,
  subtitle,
  data,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  data: RankItem[];
  accent: string;
}) {
  const max = data[0]?.count || 1;
  return (
    <MetricSection icon={Icon} title={title} subtitle={subtitle} accent={accent}>
      {data.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">Sem dados.</div>
      ) : (
        <div className="overflow-x-auto scrollbar-thin max-h-[480px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card border-b border-border">
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium w-10">#</th>
                <th className="px-4 py-2 font-medium">Nome</th>
                <th className="px-3 py-2 font-medium">Área</th>
                <th className="px-3 py-2 font-medium">Volume</th>
                <th className="px-3 py-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.slice(0, 30).map((item, i) => (
                <tr key={item.key} className="border-b border-border/30 hover:bg-surface/40">
                  <td className="px-4 py-2 text-xs font-mono text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-2 text-foreground font-medium">{item.name}</td>
                  <td className="px-3 py-2">
                    {item.area ? (
                      <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium border", AREA_BADGE[item.area])}>
                        {item.area}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 min-w-[120px]">
                    <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(item.count / max) * 100}%`, background: accent }}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums" style={{ color: accent }}>
                    {item.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </MetricSection>
  );
}

// ---------- Main tab ----------
export function MetricsTab({
  rows,
  messagesMap,
  onRowClick,
}: {
  rows: CaseRow[];
  messagesMap: Record<number, Message[]>;
  onRowClick: (r: CaseRow) => void;
}) {
  const firstResponders = useMemo(
    () => buildRanking(rows, (a) => ({ name: a.first_responder_name, team: a.first_responder_team })),
    [rows],
  );
  const resolvers = useMemo(
    () => buildRanking(rows, (a) => (a.resolved ? { name: a.resolver_name, team: a.resolver_team } : null)),
    [rows],
  );

  return (
    <div className="space-y-6">
      <RecurrenceSection rows={rows} onRowClick={onRowClick} />
      <WaitingSection rows={rows} messagesMap={messagesMap} onRowClick={onRowClick} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RankingTable
          icon={Trophy}
          title="Ranking · 1º Atendimento"
          subtitle="Quem mais responde primeiro nos casos"
          data={firstResponders}
          accent="var(--brand-blue)"
        />
        <RankingTable
          icon={CheckCircle2}
          title="Ranking · Resolvedores"
          subtitle="Quem mais resolve casos tecnicamente"
          data={resolvers}
          accent="var(--brand-green)"
        />
      </div>
    </div>
  );
}

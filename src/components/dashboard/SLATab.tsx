import { useMemo } from "react";
import type { CaseRow, Message } from "@/lib/supabase";
import { SLA_MINUTES, fmtDuration, fmtFirstResponse, priorityBadgeClass, getPriority } from "@/lib/format";
import { cn } from "@/lib/utils";
import { lookupMember, normalizeResolverTeam, AREA_BADGE, type Area } from "@/lib/team";
import { ExportButton } from "@/components/dashboard/ExportButton";

type SLAStat = {
  priority: "P1" | "P2" | "P3";
  sla: number;
  total: number;
  measured: number;
  onTime: number;
  late: number;
  pct: number;
  avg: number | null;
  rows: CaseRow[];
};

function computeSLA(rows: CaseRow[]): SLAStat[] {
  const out: SLAStat[] = [];
  for (const p of ["P1", "P2", "P3"] as const) {
    const sla = SLA_MINUTES[p];
    const subset = rows.filter((r) => getPriority(r) === p);
    const measured = subset.filter((r) => r.first_response_minutes != null);
    const onTime = measured.filter((r) => (r.first_response_minutes as number) <= sla).length;
    const late = measured.length - onTime;
    const pct = measured.length ? (onTime / measured.length) * 100 : 0;
    const sum = measured.reduce((s, r) => s + (r.first_response_minutes as number), 0);
    const avg = measured.length ? sum / measured.length : null;
    out.push({
      priority: p,
      sla,
      total: subset.length,
      measured: measured.length,
      onTime,
      late,
      pct,
      avg,
      rows: subset,
    });
  }
  return out;
}

function pctColor(pct: number): string {
  if (pct >= 80) return "var(--brand-green)";
  if (pct >= 50) return "var(--brand-yellow)";
  return "var(--brand-red)";
}

export function SLATab({ rows, onRowClick, messagesMap }: { rows: CaseRow[]; onRowClick: (r: CaseRow) => void; messagesMap?: Record<number, Message[]> }) {
  const stats = useMemo(() => computeSLA(rows), [rows]);
  const measured = useMemo(() => rows.filter((r) => r.first_response_minutes != null && getPriority(r)), [rows]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {measured.length.toLocaleString("pt-BR")} casos com 1ª resposta mensurada
        </div>
        <ExportButton rows={measured} scope="sla" messagesMap={messagesMap} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((s) => {
          const color = pctColor(s.pct);
          return (
            <div key={s.priority} className="glass-card p-5 fade-in relative overflow-hidden">
              <div
                className="absolute top-0 left-0 right-0 h-[3px]"
                style={{ background: color }}
              />
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className={cn("px-2 py-0.5 rounded-md text-xs font-semibold border", priorityBadgeClass(s.priority))}>
                    {s.priority}
                  </span>
                  <p className="mt-2 text-xs text-muted-foreground">SLA 1ª resposta: <span className="text-foreground/90 font-medium">{fmtDuration(s.sla)}</span></p>
                </div>
                <div className="text-right">
                  <div className="font-display text-3xl font-semibold tabular-nums" style={{ color }}>
                    {s.pct.toFixed(0)}%
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">cumprimento</div>
                </div>
              </div>

              <div className="h-2 rounded-full bg-surface overflow-hidden mb-4">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(s.pct, 100)}%`, background: color }} />
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-surface/50 border border-border/60 p-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</div>
                  <div className="mt-1 text-sm font-semibold tabular-nums">{s.total}</div>
                </div>
                <div className="rounded-md bg-[var(--brand-green)]/10 border border-[var(--brand-green)]/30 p-2">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--brand-green)]">No prazo</div>
                  <div className="mt-1 text-sm font-semibold tabular-nums text-[var(--brand-green)]">{s.onTime}</div>
                </div>
                <div className="rounded-md bg-[var(--brand-red)]/10 border border-[var(--brand-red)]/30 p-2">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--brand-red)]">Atrasados</div>
                  <div className="mt-1 text-sm font-semibold tabular-nums text-[var(--brand-red)]">{s.late}</div>
                </div>
              </div>

              <div className="mt-3 text-xs text-muted-foreground">
                Tempo médio 1ª resposta: <span className="text-foreground/90 font-medium tabular-nums">{fmtDuration(s.avg)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-5">
        {stats.map((s) => (
          <div key={s.priority} className="glass-card glass-card-static overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface/40">
              <div className="flex items-center gap-2">
                <span className={cn("px-2 py-0.5 rounded-md text-xs font-semibold border", priorityBadgeClass(s.priority))}>{s.priority}</span>
                <span className="text-sm text-foreground/90">{s.rows.length} caso(s)</span>
              </div>
              <span className="text-xs text-muted-foreground">SLA: {fmtDuration(s.sla)}</span>
            </div>

            {/* Mobile: stacked cards */}
            <div className="md:hidden divide-y divide-border/40 max-h-[480px] overflow-y-auto scrollbar-thin">
              {s.rows.length === 0 && (
                <div className="px-4 py-8 text-center text-muted-foreground text-sm">Nenhum caso nesta prioridade.</div>
              )}
              {s.rows.slice(0, 100).map((r) => {
                const fr = r.first_response_minutes;
                const inSla = fr != null && fr <= s.sla;
                const team = r.analysis ? (normalizeResolverTeam(r.analysis.resolver_team) || lookupMember(r.analysis.resolver_name).area) : null;
                const resolverName = r.analysis?.resolver_name ? lookupMember(r.analysis.resolver_name).name : "—";
                return (
                  <button
                    key={r.id}
                    onClick={() => onRowClick(r)}
                    className="w-full text-left px-4 py-3 hover:bg-surface/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="font-mono text-[11px] text-muted-foreground">{r.idclinic || "—"}</span>
                      {fr != null && (
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-semibold border",
                          inSla
                            ? "bg-[var(--brand-green)]/15 text-[var(--brand-green)] border-[var(--brand-green)]/40"
                            : "bg-[var(--brand-red)]/15 text-[var(--brand-red)] border-[var(--brand-red)]/40"
                        )}>
                          {inSla ? "No prazo" : "Atrasado"}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground line-clamp-2 leading-snug mb-2">{r.thread_title || "(sem título)"}</p>
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span>
                        <span className="text-muted-foreground">1ª resp: </span>
                        {fr == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="font-semibold tabular-nums" style={{ color: inSla ? "var(--brand-green)" : "var(--brand-red)" }}>
                            {fmtFirstResponse(fr)}
                          </span>
                        )}
                      </span>
                      {team ? (
                        <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium border truncate max-w-[55%]", AREA_BADGE[team as Area])}>
                          {resolverName}
                        </span>
                      ) : <span className="text-muted-foreground">{resolverName}</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto scrollbar-thin max-h-[320px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card border-b border-border">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2 font-medium">IDCLINIC</th>
                    <th className="px-4 py-2 font-medium">Título</th>
                    <th className="px-3 py-2 font-medium">1ª Resp.</th>
                    <th className="px-3 py-2 font-medium">SLA</th>
                    <th className="px-3 py-2 font-medium">Resolvido por</th>
                  </tr>
                </thead>
                <tbody>
                  {s.rows.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground text-sm">Nenhum caso nesta prioridade.</td></tr>
                  )}
                  {s.rows.slice(0, 100).map((r) => {
                    const fr = r.first_response_minutes;
                    const inSla = fr != null && fr <= s.sla;
                    const team = r.analysis ? (normalizeResolverTeam(r.analysis.resolver_team) || lookupMember(r.analysis.resolver_name).area) : null;
                    const resolverName = r.analysis?.resolver_name ? lookupMember(r.analysis.resolver_name).name : "—";
                    return (
                      <tr key={r.id} onClick={() => onRowClick(r)} className="border-b border-border/30 hover:bg-surface/40 cursor-pointer transition-colors duration-150">
                        <td className="px-4 py-2 font-mono text-xs">{r.idclinic || "—"}</td>
                        <td className="px-4 py-2 max-w-[380px] truncate" title={r.thread_title || ""}>{r.thread_title || "(sem título)"}</td>
                        <td className="px-3 py-2 text-xs tabular-nums">
                          {fr == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span
                              className="font-semibold"
                              style={{ color: inSla ? "var(--brand-green)" : "var(--brand-red)" }}
                            >
                              {fmtFirstResponse(fr)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {fr == null ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <span className={cn(
                              "px-2 py-0.5 rounded-md text-[11px] font-semibold border",
                              inSla
                                ? "bg-[var(--brand-green)]/15 text-[var(--brand-green)] border-[var(--brand-green)]/40"
                                : "bg-[var(--brand-red)]/15 text-[var(--brand-red)] border-[var(--brand-red)]/40"
                            )}>
                              {inSla ? "No prazo" : "Atrasado"}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {team ? (
                            <span className={cn("px-2 py-0.5 rounded-md text-[11px] font-medium border", AREA_BADGE[team as Area])}>
                              {resolverName}
                            </span>
                          ) : <span className="text-xs text-muted-foreground">{resolverName}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import type { CaseRow, Message } from "@/lib/supabase";
import { SLA_MINUTES, fmtDuration, fmtFirstResponse, getPriority } from "@/lib/format";
import { cn } from "@/lib/utils";
import { lookupMember, normalizeResolverTeam, AREA_BADGE, AREA_COLOR_HEX, type Area } from "@/lib/team";
import { ExportButton } from "@/components/dashboard/ExportButton";
import {
  OverviewDateFilter,
  rangeForPreset,
  filterByDateRange,
  DEFAULT_PRESET,
  type DateRange,
  type PresetKey,
} from "@/components/dashboard/OverviewDateFilter";

// SLA fixo de 1h para AM
const AM_SLA_MINUTES = 60;

type AreaCardConfig = {
  area: Area;
  label: string;
  description: string;
  // priority = P1/P2/P3, fixed = SLA fixo, none = sem SLA
  slaMode: "priority" | "fixed" | "none";
  fixedSla?: number;
};

const CARDS: AreaCardConfig[] = [
  {
    area: "SuporteN2",
    label: "Suporte N2 (resolução direta)",
    description: "N2 foi o primeiro responder e o único resolvedor (sem triagem)",
    slaMode: "priority",
  },
  {
    area: "Chatbot",
    label: "Chatbot",
    description: "Casos onde o time Chatbot foi acionado (marcado ou participou)",
    slaMode: "none",
  },
  {
    area: "AM",
    label: "AM",
    description: "Casos onde o time AM foi acionado (marcado ou participou)",
    slaMode: "fixed",
    fixedSla: AM_SLA_MINUTES,
  },
];

// Detecta se um time foi mencionado em alguma mensagem da thread
function teamWasMentioned(messages: Message[] | undefined, area: Area): boolean {
  if (!messages || messages.length === 0) return false;
  const targets: string[] = [];
  if (area === "Chatbot") targets.push("@chatbot");
  if (area === "AM") targets.push("@am ", "@am.", "@am,", "@am:", "@am\n", "@account manager");
  if (area === "SuporteN2") targets.push("@suporte n2", "@suporten2", "@n2");
  if (targets.length === 0) return false;
  return messages.some((m) => {
    const c = (m.content || "").toLowerCase();
    return targets.some((t) => c.includes(t));
  });
}

// Detecta se alguém do time efetivamente participou da thread
function teamHasParticipant(messages: Message[] | undefined, area: Area): boolean {
  if (!messages || messages.length === 0) return false;
  return messages.some((m) => {
    const member = lookupMember(m.author_username);
    return member.area === area;
  });
}

// Card 1: N2 foi o primeiro responder E o único resolvedor (sem triagem pra outros times)
function isPureN2(r: CaseRow, msgs: Message[] | undefined): boolean {
  const firstResponderTeam = r.analysis?.first_responder_team;
  const resolverTeam = r.analysis?.resolver_team;
  const firstIsN2 = normalizeResolverTeam(firstResponderTeam) === "SuporteN2"
    || (firstResponderTeam || "").toLowerCase().includes("n2");
  const resolverIsN2 = normalizeResolverTeam(resolverTeam) === "SuporteN2"
    || (resolverTeam || "").toLowerCase().includes("n2");
  if (!firstIsN2 || !resolverIsN2) return false;
  // Sem triagem: ninguém do Chatbot ou AM tocou no caso
  if (teamHasParticipant(msgs, "Chatbot")) return false;
  if (teamHasParticipant(msgs, "AM")) return false;
  if (teamWasMentioned(msgs, "Chatbot")) return false;
  if (teamWasMentioned(msgs, "AM")) return false;
  return true;
}

// Card 2 / 3: time foi acionado (mention OU participação OU IA marcou alguém da área)
function teamWasActivated(r: CaseRow, msgs: Message[] | undefined, area: Area): boolean {
  if (teamWasMentioned(msgs, area)) return true;
  if (teamHasParticipant(msgs, area)) return true;
  const fr = normalizeResolverTeam(r.analysis?.first_responder_team);
  const rs = normalizeResolverTeam(r.analysis?.resolver_team);
  if (fr === area || rs === area) return true;
  return false;
}

type AreaStats = {
  config: AreaCardConfig;
  total: number;
  measured: number;
  avg: number | null;
  onTime: number;
  late: number;
  pct: number;
  rows: CaseRow[];
};

function computeAreaStats(
  rows: CaseRow[],
  messagesMap: Record<number, Message[]>,
): AreaStats[] {
  const result: AreaStats[] = [];

  for (const cfg of CARDS) {
    let subset: CaseRow[];
    if (cfg.area === "SuporteN2") {
      subset = rows.filter((r) => isPureN2(r, messagesMap[r.id]));
    } else {
      subset = rows.filter((r) => teamWasActivated(r, messagesMap[r.id], cfg.area));
    }

    const measured = subset.filter((r) => r.first_response_minutes != null);
    const sum = measured.reduce((s, r) => s + (r.first_response_minutes as number), 0);
    const avg = measured.length ? sum / measured.length : null;

    let onTime = 0;
    let late = 0;
    if (cfg.slaMode === "priority") {
      for (const r of measured) {
        const p = getPriority(r);
        const sla = p ? SLA_MINUTES[p] : null;
        if (sla == null) continue;
        if ((r.first_response_minutes as number) <= sla) onTime++;
        else late++;
      }
    } else if (cfg.slaMode === "fixed" && cfg.fixedSla) {
      for (const r of measured) {
        if ((r.first_response_minutes as number) <= cfg.fixedSla) onTime++;
        else late++;
      }
    }

    const totalEvaluated = onTime + late;
    const pct = totalEvaluated ? (onTime / totalEvaluated) * 100 : 0;

    result.push({
      config: cfg,
      total: subset.length,
      measured: measured.length,
      avg,
      onTime,
      late,
      pct,
      rows: subset,
    });
  }

  return result;
}

function pctColor(pct: number): string {
  if (pct >= 80) return "var(--brand-green)";
  if (pct >= 50) return "var(--brand-yellow)";
  return "var(--brand-red)";
}

export function SLATab({
  rows,
  onRowClick,
  messagesMap,
}: {
  rows: CaseRow[];
  onRowClick: (r: CaseRow) => void;
  messagesMap?: Record<number, Message[]>;
}) {
  const [preset, setPreset] = useState<PresetKey>(DEFAULT_PRESET);
  const [range, setRange] = useState<DateRange>(() => rangeForPreset(DEFAULT_PRESET));

  const filteredRows = useMemo(() => filterByDateRange(rows, range), [rows, range]);
  const safeMessagesMap = messagesMap || {};

  const stats = useMemo(
    () => computeAreaStats(filteredRows, safeMessagesMap),
    [filteredRows, safeMessagesMap],
  );

  const measured = useMemo(
    () => filteredRows.filter((r) => r.first_response_minutes != null),
    [filteredRows],
  );

  return (
    <div className="space-y-6">
      <OverviewDateFilter
        preset={preset}
        range={range}
        onChange={(p, r) => {
          setPreset(p);
          setRange(r);
        }}
      />

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {measured.length.toLocaleString("pt-BR")} casos com 1ª resposta mensurada
        </div>
        <ExportButton rows={measured} scope="sla" messagesMap={messagesMap} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((s) => {
          const accent = AREA_COLOR_HEX[s.config.area];
          const showSLA = s.config.slaMode !== "none";
          const color = showSLA ? pctColor(s.pct) : accent;
          return (
            <div key={s.config.area} className="glass-card p-5 fade-in relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: accent }} />
              <div className="flex items-start justify-between mb-3 gap-2">
                <div className="min-w-0">
                  <span className={cn("px-2 py-0.5 rounded-md text-xs font-semibold border", AREA_BADGE[s.config.area])}>
                    {s.config.label}
                  </span>
                  <p className="mt-2 text-xs text-muted-foreground leading-snug">{s.config.description}</p>
                </div>
                <div className="text-right shrink-0">
                  {showSLA ? (
                    <>
                      <div className="font-display text-3xl font-semibold tabular-nums" style={{ color }}>
                        {s.pct.toFixed(0)}%
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">cumprimento</div>
                    </>
                  ) : (
                    <>
                      <div className="font-display text-3xl font-semibold tabular-nums" style={{ color: accent }}>
                        {s.measured}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">respostas</div>
                    </>
                  )}
                </div>
              </div>

              {showSLA && (
                <div className="h-2 rounded-full bg-surface overflow-hidden mb-4">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(s.pct, 100)}%`, background: color }}
                  />
                </div>
              )}

              {showSLA ? (
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
              ) : (
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-md bg-surface/50 border border-border/60 p-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Casos acionados</div>
                    <div className="mt-1 text-sm font-semibold tabular-nums">{s.total}</div>
                  </div>
                  <div className="rounded-md bg-surface/50 border border-border/60 p-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Mensurados</div>
                    <div className="mt-1 text-sm font-semibold tabular-nums">{s.measured}</div>
                  </div>
                </div>
              )}

              <div className="mt-3 text-xs text-muted-foreground">
                Tempo médio 1ª resposta:{" "}
                <span className="text-foreground/90 font-medium tabular-nums">{fmtDuration(s.avg)}</span>
                {s.config.slaMode === "fixed" && s.config.fixedSla && (
                  <span className="ml-2 text-muted-foreground/70">(SLA: {fmtDuration(s.config.fixedSla)})</span>
                )}
                {s.config.slaMode === "priority" && (
                  <span className="ml-2 text-muted-foreground/70">(SLA por prioridade)</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-5">
        {stats.map((s) => (
          <div key={s.config.area} className="glass-card glass-card-static overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface/40 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className={cn("px-2 py-0.5 rounded-md text-xs font-semibold border", AREA_BADGE[s.config.area])}>
                  {s.config.label}
                </span>
                <span className="text-sm text-foreground/90">{s.rows.length} caso(s)</span>
              </div>
              {s.config.slaMode === "priority" && (
                <span className="text-xs text-muted-foreground">SLA: P1=4h · P2=2h · P3=30min</span>
              )}
              {s.config.slaMode === "fixed" && s.config.fixedSla && (
                <span className="text-xs text-muted-foreground">SLA: {fmtDuration(s.config.fixedSla)}</span>
              )}
              {s.config.slaMode === "none" && (
                <span className="text-xs text-muted-foreground">Sem SLA fixo</span>
              )}
            </div>

            <div className="md:hidden divide-y divide-border/40 max-h-[480px] overflow-y-auto scrollbar-thin">
              {s.rows.length === 0 && (
                <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                  Nenhum caso encontrado para este time.
                </div>
              )}
              {s.rows.slice(0, 100).map((r) => {
                const fr = r.first_response_minutes;
                const slaThreshold = s.config.slaMode === "fixed"
                  ? s.config.fixedSla
                  : s.config.slaMode === "priority"
                    ? (getPriority(r) ? SLA_MINUTES[getPriority(r) as string] : null)
                    : null;
                const inSla = fr != null && slaThreshold != null ? fr <= slaThreshold : null;
                const team = r.analysis
                  ? normalizeResolverTeam(r.analysis.resolver_team) || lookupMember(r.analysis.resolver_name).area
                  : null;
                const resolverName = r.analysis?.resolver_name
                  ? lookupMember(r.analysis.resolver_name).name
                  : "—";
                return (
                  <button
                    key={r.id}
                    onClick={() => onRowClick(r)}
                    className="w-full text-left px-4 py-3 hover:bg-surface/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="font-mono text-[11px] text-muted-foreground">{r.idclinic || "—"}</span>
                      {fr != null && inSla != null && (
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-semibold border",
                          inSla
                            ? "bg-[var(--brand-green)]/15 text-[var(--brand-green)] border-[var(--brand-green)]/40"
                            : "bg-[var(--brand-red)]/15 text-[var(--brand-red)] border-[var(--brand-red)]/40",
                        )}>
                          {inSla ? "No prazo" : "Atrasado"}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground line-clamp-2 leading-snug mb-2">
                      {r.thread_title || "(sem título)"}
                    </p>
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span>
                        <span className="text-muted-foreground">1ª resp: </span>
                        {fr == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span
                            className="font-semibold tabular-nums"
                            style={{
                              color: inSla == null
                                ? undefined
                                : inSla ? "var(--brand-green)" : "var(--brand-red)",
                            }}
                          >
                            {fmtFirstResponse(fr)}
                          </span>
                        )}
                      </span>
                      {team ? (
                        <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium border truncate max-w-[55%]", AREA_BADGE[team as Area])}>
                          {resolverName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{resolverName}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="hidden md:block overflow-x-auto scrollbar-thin max-h-[320px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card border-b border-border">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2 font-medium">IDCLINIC</th>
                    <th className="px-4 py-2 font-medium">Título</th>
                    <th className="px-3 py-2 font-medium">1ª Resp.</th>
                    {s.config.slaMode !== "none" && <th className="px-3 py-2 font-medium">SLA</th>}
                    <th className="px-3 py-2 font-medium">Resolvido por</th>
                  </tr>
                </thead>
                <tbody>
                  {s.rows.length === 0 && (
                    <tr>
                      <td colSpan={s.config.slaMode === "none" ? 4 : 5} className="px-4 py-6 text-center text-muted-foreground text-sm">
                        Nenhum caso encontrado para este time.
                      </td>
                    </tr>
                  )}
                  {s.rows.slice(0, 100).map((r) => {
                    const fr = r.first_response_minutes;
                    const slaThreshold = s.config.slaMode === "fixed"
                      ? s.config.fixedSla
                      : s.config.slaMode === "priority"
                        ? (getPriority(r) ? SLA_MINUTES[getPriority(r) as string] : null)
                        : null;
                    const inSla = fr != null && slaThreshold != null ? fr <= slaThreshold : null;
                    const team = r.analysis
                      ? normalizeResolverTeam(r.analysis.resolver_team) || lookupMember(r.analysis.resolver_name).area
                      : null;
                    const resolverName = r.analysis?.resolver_name
                      ? lookupMember(r.analysis.resolver_name).name
                      : "—";
                    return (
                      <tr
                        key={r.id}
                        onClick={() => onRowClick(r)}
                        className="border-b border-border/30 hover:bg-surface/40 cursor-pointer transition-colors duration-150"
                      >
                        <td className="px-4 py-2 font-mono text-xs">{r.idclinic || "—"}</td>
                        <td className="px-4 py-2 max-w-[380px] truncate" title={r.thread_title || ""}>
                          {r.thread_title || "(sem título)"}
                        </td>
                        <td className="px-3 py-2 text-xs tabular-nums">
                          {fr == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span
                              className="font-semibold"
                              style={{
                                color: inSla == null
                                  ? undefined
                                  : inSla ? "var(--brand-green)" : "var(--brand-red)",
                              }}
                            >
                              {fmtFirstResponse(fr)}
                            </span>
                          )}
                        </td>
                        {s.config.slaMode !== "none" && (
                          <td className="px-3 py-2">
                            {fr == null || inSla == null ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              <span className={cn(
                                "px-2 py-0.5 rounded-md text-[11px] font-semibold border",
                                inSla
                                  ? "bg-[var(--brand-green)]/15 text-[var(--brand-green)] border-[var(--brand-green)]/40"
                                  : "bg-[var(--brand-red)]/15 text-[var(--brand-red)] border-[var(--brand-red)]/40",
                              )}>
                                {inSla ? "No prazo" : "Atrasado"}
                              </span>
                            )}
                          </td>
                        )}
                        <td className="px-3 py-2">
                          {team ? (
                            <span className={cn("px-2 py-0.5 rounded-md text-[11px] font-medium border", AREA_BADGE[team as Area])}>
                              {resolverName}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">{resolverName}</span>
                          )}
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
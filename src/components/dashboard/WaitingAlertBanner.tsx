import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import type { CaseRow, Message } from "@/lib/supabase";
import { getPriority, SLA_MINUTES } from "@/lib/format";
import { lookupMember, RESOLUTIVE_AREAS } from "@/lib/team";

function getLastActivity(row: CaseRow, messages?: Message[]): string | null {
  if (messages && messages.length) return messages[messages.length - 1].sent_at;
  if (row.last_activity_at) return row.last_activity_at;
  return row.opened_at || null;
}

// Verifica se a última mensagem da thread é de alguém da equipe técnica.
// Se for, o caso está aguardando resposta DO solicitante, não da equipe.
function isAwaitingRequester(messages?: Message[]): boolean {
  if (!messages || messages.length === 0) return false;
  const last = messages[messages.length - 1];
  const member = lookupMember(last.author_username);
  return !!member.area && RESOLUTIVE_AREAS.includes(member.area);
}

function fmtWaiting(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}min aguardando`;
  const h = minutes / 60;
  if (h < 24) return `${h.toFixed(1)}h aguardando`;
  return `${Math.floor(h / 24)}d aguardando`;
}

// Status do SLA: aviso antecipado baseado em % do SLA da prioridade
type SlaState = "ok" | "warn" | "critical" | "breached";

function getSlaState(minutes: number, priority: string | null): SlaState {
  // Sem prioridade definida → usa thresholds genéricos
  if (!priority) {
    if (minutes < 30) return "ok";
    if (minutes < 120) return "warn";
    if (minutes < 480) return "critical";
    return "breached";
  }
  const sla = SLA_MINUTES[priority];
  if (!sla) return "ok";
  const pct = minutes / sla;
  if (pct >= 1) return "breached";
  if (pct >= 0.75) return "critical";
  if (pct >= 0.5) return "warn";
  return "ok";
}

function stateColor(state: SlaState): string {
  switch (state) {
    case "ok":        return "#10b981";
    case "warn":      return "#f59e0b";
    case "critical":  return "#f97316";
    case "breached":  return "#ef4444";
  }
}

function stateLabel(state: SlaState, priority: string | null, minutes: number): string {
  if (!priority) return "";
  const sla = SLA_MINUTES[priority];
  if (!sla) return "";
  const remaining = sla - minutes;
  switch (state) {
    case "ok":        return `SLA ${priority} · dentro do prazo`;
    case "warn":      return `SLA ${priority} · ${Math.round(remaining)}min restantes`;
    case "critical":  return `SLA ${priority} · ${Math.round(remaining)}min para estourar`;
    case "breached":  return `SLA ${priority} · estourado há ${Math.round(-remaining)}min`;
  }
}

function priorityBadge(p: string | null | undefined) {
  const v = (p || "").toUpperCase();
  const colors: Record<string, { bg: string; fg: string; bd: string }> = {
    P1: { bg: "rgba(245,158,11,0.15)", fg: "#f59e0b", bd: "rgba(245,158,11,0.4)" },
    P2: { bg: "rgba(249,115,22,0.15)", fg: "#f97316", bd: "rgba(249,115,22,0.4)" },
    P3: { bg: "rgba(239,68,68,0.15)", fg: "#ef4444", bd: "rgba(239,68,68,0.4)" },
  };
  const c = colors[v];
  if (!c) return null;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border"
      style={{ background: c.bg, color: c.fg, borderColor: c.bd }}
    >
      {v}
    </span>
  );
}

type Props = {
  rows: CaseRow[];
  messagesMap: Record<number, Message[]>;
  onRowClick?: (row: CaseRow) => void;
};

type EnrichedRow = {
  row: CaseRow;
  minutes: number;
  priority: string | null;
  slaState: SlaState;
};

export function WaitingAlertBanner({ rows, messagesMap, onRowClick }: Props) {
  // Tick every 60s to refresh waiting times
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { active, stats } = useMemo(() => {
    const open = rows.filter((r) => {
      const status = (r.status || "").toLowerCase();
      if (status === "aberto" || status === "open") return true;
      if (!r.closed_at && status !== "fechado" && status !== "closed" && status !== "resolvido") return true;
      return false;
    });

    const enriched: EnrichedRow[] = open
      .map((r) => {
        const msgs = messagesMap[r.id];
        // Se a última mensagem é da equipe técnica, está aguardando o solicitante — não é problema da equipe
        if (isAwaitingRequester(msgs)) return null;
        const last = getLastActivity(r, msgs);
        if (!last) return null;
        const minutes = (now - new Date(last).getTime()) / 60000;
        if (!isFinite(minutes) || minutes < 0) return null;
        const priority = getPriority(r);
        const slaState = getSlaState(minutes, priority);
        return { row: r, minutes, priority, slaState };
      })
      .filter((x): x is EnrichedRow => !!x);

    // Mostra apenas os que precisam de atenção (warn/critical/breached)
    // Casos 'ok' não aparecem no banner pra não poluir
    const attention = enriched
      .filter((e) => e.slaState !== "ok")
      .sort((a, b) => {
        // Ordena por gravidade: breached > critical > warn
        const severity = { breached: 3, critical: 2, warn: 1, ok: 0 };
        const sa = severity[a.slaState];
        const sb = severity[b.slaState];
        if (sa !== sb) return sb - sa;
        return b.minutes - a.minutes;
      })
      .slice(0, 5);

    const counts = {
      breached: enriched.filter((e) => e.slaState === "breached").length,
      critical: enriched.filter((e) => e.slaState === "critical").length,
      warn:     enriched.filter((e) => e.slaState === "warn").length,
      total:    enriched.length,
    };

    return { active: attention, stats: counts };
  }, [rows, messagesMap, now]);

  if (stats.total === 0) {
    return (
      <div
        className="rounded-[10px] px-5 py-4 flex items-center gap-3"
        style={{
          background: "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(16,185,129,0.03))",
          border: "1px solid rgba(16,185,129,0.2)",
        }}
      >
        <CheckCircle2 size={20} style={{ color: "#10b981" }} />
        <span className="text-[13px] text-foreground/90">Nenhum caso aguardando atendimento</span>
      </div>
    );
  }

  if (active.length === 0) {
    return (
      <div
        className="rounded-[10px] px-5 py-4 flex items-center gap-3"
        style={{
          background: "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(16,185,129,0.03))",
          border: "1px solid rgba(16,185,129,0.2)",
        }}
      >
        <CheckCircle2 size={20} style={{ color: "#10b981" }} />
        <span className="text-[13px] text-foreground/90">
          {stats.total} caso(s) em aberto, todos dentro do SLA
        </span>
      </div>
    );
  }

  // Cor do banner baseada na maior gravidade
  const hasBreached = stats.breached > 0;
  const hasCritical = stats.critical > 0;
  const primaryColor = hasBreached ? "#ef4444" : hasCritical ? "#f97316" : "#f59e0b";
  const bgGradient = hasBreached
    ? "linear-gradient(135deg, rgba(239,68,68,0.08), rgba(249,115,22,0.04))"
    : hasCritical
    ? "linear-gradient(135deg, rgba(249,115,22,0.08), rgba(245,158,11,0.04))"
    : "linear-gradient(135deg, rgba(245,158,11,0.08), rgba(245,158,11,0.03))";

  return (
    <div
      className="rounded-[10px] px-5 py-4"
      style={{
        background: bgGradient,
        border: `1px solid ${primaryColor}33`,
      }}
    >
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {hasBreached ? (
            <AlertTriangle size={20} style={{ color: primaryColor }} />
          ) : (
            <Clock size={20} style={{ color: primaryColor }} />
          )}
          <span
            className="text-[10px] font-semibold uppercase"
            style={{ color: primaryColor, letterSpacing: "0.1em" }}
          >
            Casos aguardando atendimento
          </span>
        </div>
        <div className="flex items-center gap-2">
          {stats.breached > 0 && (
            <span
              className="text-[10px] font-semibold px-2 py-1 rounded"
              style={{
                background: "rgba(239,68,68,0.15)",
                color: "#ef4444",
                border: "1px solid rgba(239,68,68,0.3)",
              }}
            >
              {stats.breached} estourado{stats.breached > 1 ? "s" : ""}
            </span>
          )}
          {stats.critical > 0 && (
            <span
              className="text-[10px] font-semibold px-2 py-1 rounded"
              style={{
                background: "rgba(249,115,22,0.15)",
                color: "#f97316",
                border: "1px solid rgba(249,115,22,0.3)",
              }}
            >
              {stats.critical} crítico{stats.critical > 1 ? "s" : ""}
            </span>
          )}
          {stats.warn > 0 && (
            <span
              className="text-[10px] font-semibold px-2 py-1 rounded"
              style={{
                background: "rgba(245,158,11,0.15)",
                color: "#f59e0b",
                border: "1px solid rgba(245,158,11,0.3)",
              }}
            >
              {stats.warn} em alerta
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col">
        {active.map(({ row, minutes, priority, slaState }) => {
          const color = stateColor(slaState);
          const label = stateLabel(slaState, priority, minutes);
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => onRowClick?.(row)}
              className="flex items-center gap-3 px-2 py-2 rounded transition-colors text-left"
              style={{ background: "transparent" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span
                className="font-mono text-[12px] font-semibold tabular-nums shrink-0"
                style={{ color: "#256EFF", minWidth: 64 }}
              >
                #{row.idclinic || row.case_number || row.id}
              </span>
              <div className="flex-1 min-w-0">
                <div
                  className="text-[13px] text-foreground/90 truncate"
                  title={row.thread_title || ""}
                >
                  {row.thread_title || "Sem título"}
                </div>
                {label && (
                  <div
                    className="text-[10px] tabular-nums mt-0.5"
                    style={{ color }}
                  >
                    {label}
                  </div>
                )}
              </div>
              <span
                className="text-[12px] font-bold tabular-nums shrink-0"
                style={{ color, minWidth: 130, textAlign: "right" }}
              >
                {fmtWaiting(minutes)}
              </span>
              <span className="shrink-0">{priorityBadge(priority)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
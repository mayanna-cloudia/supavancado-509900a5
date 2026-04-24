import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { CaseRow, Message } from "@/lib/supabase";
import { getPriority } from "@/lib/format";

function getLastActivity(row: CaseRow, messages?: Message[]): string | null {
  if (row.last_activity_at) return row.last_activity_at;
  if (messages && messages.length) return messages[messages.length - 1].sent_at;
  return row.opened_at || null;
}

function fmtWaiting(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}min aguardando`;
  const h = minutes / 60;
  if (h < 24) return `${h.toFixed(1)}h aguardando`;
  return `${Math.floor(h / 24)}d aguardando`;
}

function waitingColor(minutes: number): string {
  if (minutes < 30) return "#10b981";
  if (minutes < 120) return "#f59e0b";
  if (minutes < 480) return "#f97316";
  return "#ef4444";
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

export function WaitingAlertBanner({ rows, messagesMap, onRowClick }: Props) {
  // Tick every 60s to refresh waiting times
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const top = useMemo(() => {
    const open = rows.filter((r) => {
      const status = (r.status || "").toLowerCase();
      // Treat as open: status 'aberto' OR no closed_at
      if (status === "aberto" || status === "open") return true;
      if (!r.closed_at && status !== "fechado" && status !== "closed" && status !== "resolvido") return true;
      return false;
    });
    const enriched = open
      .map((r) => {
        const last = getLastActivity(r, messagesMap[r.id]);
        if (!last) return null;
        const minutes = (now - new Date(last).getTime()) / 60000;
        if (!isFinite(minutes) || minutes < 0) return null;
        return { row: r, minutes };
      })
      .filter((x): x is { row: CaseRow; minutes: number } => !!x)
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 3);
    return enriched;
  }, [rows, messagesMap, now]);

  if (top.length === 0) {
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

  return (
    <div
      className="rounded-[10px] px-5 py-4"
      style={{
        background: "linear-gradient(135deg, rgba(239,68,68,0.08), rgba(249,115,22,0.04))",
        border: "1px solid rgba(239,68,68,0.2)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={20} style={{ color: "#ef4444" }} />
          <span
            className="text-[10px] font-semibold uppercase"
            style={{ color: "#ef4444", letterSpacing: "0.1em" }}
          >
            Tempo aguardando atendimento
          </span>
        </div>
        <span
          className="text-[10px] font-semibold px-2 py-1 rounded"
          style={{
            background: "rgba(239,68,68,0.15)",
            color: "#ef4444",
            border: "1px solid rgba(239,68,68,0.3)",
          }}
        >
          {top.length} {top.length === 1 ? "caso crítico" : "casos críticos"}
        </span>
      </div>

      <div className="flex flex-col">
        {top.map(({ row, minutes }) => (
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
            <span
              className="text-[13px] text-foreground/90 truncate flex-1"
              style={{ maxWidth: 280 }}
              title={row.thread_title || ""}
            >
              {row.thread_title || "Sem título"}
            </span>
            <span
              className="text-[12px] font-bold tabular-nums shrink-0"
              style={{ color: waitingColor(minutes), minWidth: 130, textAlign: "right" }}
            >
              {fmtWaiting(minutes)}
            </span>
            <span className="shrink-0">{priorityBadge(getPriority(row))}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

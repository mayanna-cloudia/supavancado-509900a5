import { useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from "recharts";
import type { CaseRow, Message } from "@/lib/supabase";
import { fmtDuration, weekKey, weekLabel } from "@/lib/format";
import { KpiCard } from "./KpiCard";
import { WaitingAlertBanner } from "./WaitingAlertBanner";
import {
  OverviewDateFilter, filterByDateRange, rangeForPreset,
  DEFAULT_PRESET, type DateRange, type PresetKey,
} from "./OverviewDateFilter";
import { lookupMember, normalizeResolverTeam, AREA_COLOR_HEX, AREA_LABEL, type Area } from "@/lib/team";

const CHART_PALETTE = ["#256EFF", "#715AFF", "#10b981", "#f97316", "#f59e0b", "#ef4444", "#06b6d4", "#a3e635"];

function ChartCard({ title, subtitle, children, height = 280 }: { title: string; subtitle?: string; children: React.ReactNode; height?: number }) {
  return (
    <div className="flat-card flat-card-interactive fade-in" style={{ padding: "16px 18px" }}>
      <div className="mb-4">
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div style={{ height }}>{children}</div>
    </div>
  );
}

const tooltipStyle = {
  contentStyle: {
    background: "#131929",
    border: "1px solid #1f2940",
    borderRadius: 8,
    color: "#e6e9f2",
    fontSize: 12,
  },
  labelStyle: { color: "#e6e9f2", fontWeight: 600 },
  itemStyle: { color: "#e6e9f2" },
};

export function OverviewTab({
  rows: allRows,
  messagesMap = {},
  onRowClick,
}: {
  rows: CaseRow[];
  messagesMap?: Record<number, Message[]>;
  onRowClick?: (row: CaseRow) => void;
}) {
  const [preset, setPreset] = useState<PresetKey>(DEFAULT_PRESET);
  const [range, setRange] = useState<DateRange>(() => rangeForPreset(DEFAULT_PRESET));

  const rows = useMemo(() => filterByDateRange(allRows, range), [allRows, range]);

  const stats = useMemo(() => {
    const total = rows.length;
    const resolved = rows.filter((r) => r.analysis?.resolved).length;
    const open = total - resolved;
    const closed = rows.filter((r) => r.closed_at);
    const durations = closed
      .map((r) => (r.closed_at && r.opened_at ? (new Date(r.closed_at).getTime() - new Date(r.opened_at).getTime()) / 60000 : null))
      .filter((x): x is number => x != null && x > 0);
    const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
    return { total, resolved, open, avgMin: avg };
  }, [rows]);

  // Cases per week (chronological)
  const weekly = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) {
      const k = weekKey(r.opened_at);
      map[k] = (map[k] || 0) + 1;
    }
    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-16)
      .map(([k, v]) => ({ week: weekLabel(k), key: k, count: v }));
  }, [rows]);

  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) {
      const c = r.analysis?.category || "Sem categoria";
      map[c] = (map[c] || 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }));
  }, [rows]);

  const byPriority = useMemo(() => {
    const map: Record<string, number> = { P1: 0, P2: 0, P3: 0 };
    for (const r of rows) {
      const p = (r.analysis?.priority || "").toUpperCase();
      if (p === "P1" || p === "P2" || p === "P3") map[p]++;
    }
    return [
      { name: "P1", value: map.P1, color: "#f59e0b" },
      { name: "P2", value: map.P2, color: "#f97316" },
      { name: "P3", value: map.P3, color: "#ef4444" },
    ];
  }, [rows]);

  const topClinics = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) {
      const c = r.idclinic || "—";
      map[c] = (map[c] || 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value }));
  }, [rows]);

  const topModules = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) {
      const m = r.analysis?.subcategory || "—";
      if (m === "—") continue;
      map[m] = (map[m] || 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value }));
  }, [rows]);

  const byResolverArea = useMemo(() => {
    const map: Partial<Record<Area, number>> = {};
    for (const r of rows) {
      if (!r.analysis?.resolved) continue;
      const team = normalizeResolverTeam(r.analysis.resolver_team) || lookupMember(r.analysis.resolver_name).area;
      // Only resolutive areas matter
      if (team === "SuporteN2" || team === "Chatbot" || team === "AM") {
        map[team] = (map[team] || 0) + 1;
      }
    }
    return (["SuporteN2", "Chatbot", "AM"] as Area[]).map((a) => ({
      name: AREA_LABEL[a],
      value: map[a] || 0,
      color: AREA_COLOR_HEX[a],
    }));
  }, [rows]);

  return (
    <div className="space-y-6">
      <WaitingAlertBanner rows={rows} messagesMap={messagesMap} onRowClick={onRowClick} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total de casos" value={stats.total.toLocaleString("pt-BR")} accent="blue" />
        <KpiCard label="Resolvidos" value={stats.resolved.toLocaleString("pt-BR")} hint={stats.total ? `${Math.round((stats.resolved / stats.total) * 100)}% do total` : undefined} accent="green" />
        <KpiCard label="Em aberto" value={stats.open.toLocaleString("pt-BR")} hint={stats.total ? `${Math.round((stats.open / stats.total) * 100)}% do total` : undefined} accent="orange" />
        <KpiCard label="Tempo médio resolução" value={fmtDuration(stats.avgMin)} accent="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ChartCard title="Casos por semana" subtitle="Volume cronológico (últimas 16 semanas)" height={300}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weekly} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="weekArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#256EFF" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#256EFF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1f2940" strokeWidth={0.5} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="week" stroke="#4a5870" fontSize={11} tickLine={false} axisLine={{ stroke: "#1f2940" }} />
                <YAxis stroke="#4a5870" fontSize={11} allowDecimals={false} tickLine={false} axisLine={{ stroke: "#1f2940" }} />
                <Tooltip {...tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#256EFF"
                  strokeWidth={2}
                  fill="url(#weekArea)"
                  dot={{ fill: "#256EFF", r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#256EFF", strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <ChartCard title="Distribuição por categoria" height={300}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={byCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={2}>
                {byCategory.map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
              </Pie>
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#e6e9f2" }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Prioridade (P1 / P2 / P3)" height={280}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={byPriority} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} innerRadius={55} paddingAngle={3} label={(e) => `${e.name}: ${e.value}`}>
                {byPriority.map((p, i) => <Cell key={i} fill={p.color} />)}
              </Pie>
              <Tooltip {...tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Resolução por área" subtitle="Apenas áreas resolutivas" height={280}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={byResolverArea} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} innerRadius={55} paddingAngle={3} label={(e) => `${e.value}`}>
                {byResolverArea.map((p, i) => <Cell key={i} fill={p.color} />)}
              </Pie>
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#e6e9f2" }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <div className="flat-card flat-card-interactive fade-in" style={{ padding: "16px 18px" }}>
          <h3 className="text-[13px] font-semibold mb-4">Resumo resolutivo</h3>
          <div className="space-y-3">
            {byResolverArea.map((a) => {
              const totalRes = byResolverArea.reduce((s, x) => s + x.value, 0);
              const pct = totalRes ? (a.value / totalRes) * 100 : 0;
              return (
                <div key={a.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-foreground/90">{a.name}</span>
                    <span className="text-muted-foreground tabular-nums">{a.value} <span className="opacity-60">({pct.toFixed(0)}%)</span></span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: a.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Top 10 clientes (IDCLINIC)" subtitle="Maior volume de casos" height={360}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topClinics} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="#1f2940" strokeWidth={0.5} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" stroke="#4a5870" fontSize={11} allowDecimals={false} tickLine={false} axisLine={{ stroke: "#1f2940" }} />
              <YAxis dataKey="name" type="category" stroke="#4a5870" fontSize={11} width={90} tickLine={false} axisLine={{ stroke: "#1f2940" }} />
              <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(37,110,255,0.08)" }} />
              <Bar dataKey="value" fill="#256EFF" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top módulos / subcategorias" height={360}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topModules} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="#1f2940" strokeWidth={0.5} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" stroke="#4a5870" fontSize={11} allowDecimals={false} tickLine={false} axisLine={{ stroke: "#1f2940" }} />
              <YAxis dataKey="name" type="category" stroke="#4a5870" fontSize={11} width={140} tickLine={false} axisLine={{ stroke: "#1f2940" }} />
              <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(113,90,255,0.08)" }} />
              <Bar dataKey="value" fill="#715AFF" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

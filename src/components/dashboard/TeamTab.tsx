import { useMemo, useState } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { Trophy } from "lucide-react";
import type { CaseRow, Message } from "@/lib/supabase";
import { lookupMember, AREA_LABEL, AREA_COLOR_HEX, AREA_BADGE, ALL_AREAS, type Area } from "@/lib/team";
import { cn } from "@/lib/utils";
import {
  OverviewDateFilter,
  rangeForPreset,
  filterByDateRange,
  DEFAULT_PRESET,
  type DateRange,
  type PresetKey,
} from "@/components/dashboard/OverviewDateFilter";

const tooltipStyle = {
  contentStyle: { background: "#131929", border: "1px solid #1f2940", borderRadius: 8, color: "#e6e9f2", fontSize: 12 },
};

function aggregateByArea(items: { username: string }[]) {
  const byArea: Partial<Record<Area, Map<string, number>>> = {};
  let unknown = 0;
  for (const it of items) {
    const info = lookupMember(it.username);
    if (!info.area) { unknown++; continue; }
    if (!byArea[info.area]) byArea[info.area] = new Map();
    const m = byArea[info.area]!;
    m.set(info.name, (m.get(info.name) || 0) + 1);
  }
  return { byArea, unknown };
}

// Verifica se alguém de outra área (Chatbot/AM/SuporteN2) participou da thread
function hasOtherAreaParticipation(msgs: Message[] | undefined, exceptArea: Area | null): boolean {
  if (!msgs || msgs.length === 0) return false;
  return msgs.some((m) => {
    const member = lookupMember(m.author_username);
    if (!member.area) return false;
    if (member.area === exceptArea) return false; // mesma área não conta
    return member.area === "Chatbot" || member.area === "AM" || member.area === "SuporteN2";
  });
}

type PersonStats = {
  username: string;
  name: string;
  area: Area | null;
  solo: number;       // Resolvidos sozinhos (foi resolver E ninguém de outra área tocou)
  involved: number;   // Foi first_responder OU resolver
  totalResolved: number;
};

function computePersonStats(rows: CaseRow[], messagesMap: Record<number, Message[]>): PersonStats[] {
  const map = new Map<string, PersonStats>();

  const ensure = (username: string): PersonStats => {
    const key = username.toLowerCase();
    if (!map.has(key)) {
      const info = lookupMember(username);
      map.set(key, {
        username: key,
        name: info.name || username,
        area: info.area,
        solo: 0,
        involved: 0,
        totalResolved: 0,
      });
    }
    return map.get(key)!;
  };

  for (const r of rows) {
    const a = r.analysis;
    if (!a) continue;

    const resolverUser = (a.resolver_name || "").toLowerCase();
    const firstUser = (a.first_responder_name || "").toLowerCase();
    const msgs = messagesMap[r.id];

    if (a.resolved && resolverUser) {
      const stats = ensure(resolverUser);
      stats.totalResolved++;

      const otherAreaTouched = hasOtherAreaParticipation(msgs, stats.area);
      if (!otherAreaTouched) {
        stats.solo++;
      }
    }

    const involvedUsers = new Set<string>();
    if (firstUser) involvedUsers.add(firstUser);
    if (resolverUser) involvedUsers.add(resolverUser);

    for (const u of involvedUsers) {
      const stats = ensure(u);
      stats.involved++;
    }
  }

  return Array.from(map.values()).filter((p) => p.area && (p.solo > 0 || p.involved > 0 || p.totalResolved > 0));
}

function PersonMetrics({ stats }: { stats: PersonStats }) {
  const pct = stats.involved > 0 ? Math.round((stats.solo / stats.involved) * 100) : 0;
  const areaColor = stats.area ? AREA_COLOR_HEX[stats.area] : "#888";

  return (
    <div className="glass-card p-4 fade-in relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: areaColor }} />

      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-medium text-foreground truncate">{stats.name}</span>
        {stats.area && (
          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold border", AREA_BADGE[stats.area])}>
            {AREA_LABEL[stats.area]}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md bg-surface/60 border border-border/50 p-2 text-center">
          <div
            className="text-[10px] uppercase tracking-wider text-muted-foreground"
            title="Casos onde a pessoa foi resolver e ninguém de outra área tocou (sem triagem)"
          >
            Resolvidos sozinhos
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums" style={{ color: "var(--brand-green)" }}>
            {stats.solo}
          </div>
        </div>
        <div className="rounded-md bg-surface/60 border border-border/50 p-2 text-center">
          <div
            className="text-[10px] uppercase tracking-wider text-muted-foreground"
            title="Casos onde a pessoa foi primeiro responder ou resolver"
          >
            Envolvidos
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums" style={{ color: "var(--brand-blue)" }}>
            {stats.involved}
          </div>
        </div>
        <div className="rounded-md bg-surface/60 border border-border/50 p-2 text-center">
          <div
            className="text-[10px] uppercase tracking-wider text-muted-foreground"
            title="Resolvidos sozinhos ÷ Envolvidos"
          >
            % sozinho
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums" style={{ color: "#715AFF" }}>
            {pct}%
          </div>
        </div>
      </div>
    </div>
  );
}

function PerPersonSection({
  rows,
  messagesMap,
}: {
  rows: CaseRow[];
  messagesMap: Record<number, Message[]>;
}) {
  const stats = useMemo(() => {
    const all = computePersonStats(rows, messagesMap);
    return all.sort((a, b) => {
      if (b.involved !== a.involved) return b.involved - a.involved;
      return a.name.localeCompare(b.name);
    });
  }, [rows, messagesMap]);

  const groupedByArea = useMemo(() => {
    const groups: Record<string, PersonStats[]> = {};
    for (const p of stats) {
      const key = p.area || "Outros";
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }
    return groups;
  }, [stats]);

  const areaOrder: Area[] = ["SuporteN2", "Chatbot", "AM"];

  return (
    <div className="glass-card p-5 fade-in">
      <div className="flex items-center gap-2 mb-4">
        <div
          className="rounded-lg p-2"
          style={{ background: "color-mix(in oklab, var(--brand-blue) 14%, transparent)" }}
        >
          <Trophy className="h-4 w-4" style={{ color: "var(--brand-blue)" }} />
        </div>
        <div>
          <h3 className="text-sm font-medium text-foreground">Métricas individuais</h3>
          <p className="text-xs text-muted-foreground">
            Quantos casos cada pessoa resolveu sozinha vs. com triagem
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {areaOrder.map((area) => {
          const people = groupedByArea[area];
          if (!people || people.length === 0) return null;
          return (
            <div key={area}>
              <div className="flex items-center gap-2 mb-3">
                <span className={cn("px-2 py-0.5 rounded text-[11px] font-semibold border", AREA_BADGE[area])}>
                  {AREA_LABEL[area]}
                </span>
                <span className="text-[11px] text-muted-foreground">{people.length} pessoa(s)</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {people.map((p) => (
                  <PersonMetrics key={p.username} stats={p} />
                ))}
              </div>
            </div>
          );
        })}

        {stats.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhuma métrica disponível no período selecionado.
          </p>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: { username: string }[];
}) {
  const { byArea } = useMemo(() => aggregateByArea(items), [items]);

  const pieData = useMemo(() => {
    const data: { name: string; value: number; color: string }[] = [];
    for (const area of ALL_AREAS) {
      const m = byArea[area];
      if (!m) continue;
      let total = 0;
      for (const v of m.values()) total += v;
      if (total > 0) data.push({ name: AREA_LABEL[area], value: total, color: AREA_COLOR_HEX[area] });
    }
    return data;
  }, [byArea]);

  return (
    <div className="glass-card p-5 fade-in">
      <div className="mb-4">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={110} paddingAngle={2}>
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                ))}
              </Pie>
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-3 max-h-[320px] overflow-y-auto scrollbar-thin pr-2">
          {ALL_AREAS.map((area) => {
            const m = byArea[area];
            if (!m) return null;
            const entries = Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
            let total = 0;
            for (const v of m.values()) total += v;
            const totalAll = pieData.reduce((s, x) => s + x.value, 0);
            const pct = totalAll ? Math.round((total / totalAll) * 100) : 0;
            return (
              <div key={area}>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold uppercase tracking-wider" style={{ color: AREA_COLOR_HEX[area] }}>
                    {AREA_LABEL[area]}
                  </span>
                  <span className="text-muted-foreground tabular-nums">{total} ({pct}%)</span>
                </div>
                <div className="space-y-1">
                  {entries.map(([name, count]) => {
                    const w = total ? (count / total) * 100 : 0;
                    return (
                      <div key={name} className="flex items-center gap-2 text-xs">
                        <span className="flex-1 truncate text-foreground/90">{name}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${w}%`, background: AREA_COLOR_HEX[area] }}
                          />
                        </div>
                        <span className="w-8 text-right tabular-nums text-foreground/80">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function TeamTab({ rows, messagesMap }: { rows: CaseRow[]; messagesMap: Record<number, Message[]> }) {
  const [preset, setPreset] = useState<PresetKey>(DEFAULT_PRESET);
  const [range, setRange] = useState<DateRange>(() => rangeForPreset(DEFAULT_PRESET));

  const filteredRows = useMemo(() => filterByDateRange(rows, range), [rows, range]);

  // Suporte Avançado participados = par único (caso, username)
  const participated = useMemo(() => {
    const out: { username: string }[] = [];
    for (const r of filteredRows) {
      const msgs = messagesMap[r.id] || [];
      const seen = new Set<string>();
      for (const m of msgs) {
        const u = (m.author_username || "").toLowerCase();
        if (!u || seen.has(u)) continue;
        seen.add(u);
        out.push({ username: m.author_username });
      }
    }
    return out;
  }, [filteredRows, messagesMap]);

  return (
    <div className="grid grid-cols-1 gap-6">
      <OverviewDateFilter
        preset={preset}
        range={range}
        onChange={(p, r) => {
          setPreset(p);
          setRange(r);
        }}
      />

      <PerPersonSection rows={filteredRows} messagesMap={messagesMap} />

      <Section
        title="Suporte Avançado Participados"
        subtitle="Cada par único (caso, pessoa) — mostra alcance da participação"
        items={participated}
      />
    </div>
  );
}
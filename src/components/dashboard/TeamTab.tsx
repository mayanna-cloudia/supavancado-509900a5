import { useMemo } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import type { CaseRow, Message } from "@/lib/supabase";
import { lookupMember, AREA_LABEL, AREA_COLOR_HEX, ALL_AREAS, type Area } from "@/lib/team";
import { cn } from "@/lib/utils";

const tooltipStyle = {
  contentStyle: { background: "#111820", border: "1px solid #1a2233", borderRadius: 8, color: "#dde3f0", fontSize: 12 },
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

function Section({
  title, subtitle, items,
}: {
  title: string;
  subtitle: string;
  items: { username: string }[];
}) {
  const { byArea } = useMemo(() => aggregateByArea(items), [items]);

  const pieData = useMemo(() => {
    return ALL_AREAS.map((a) => {
      const m = byArea[a];
      const total = m ? Array.from(m.values()).reduce((s, v) => s + v, 0) : 0;
      return { name: AREA_LABEL[a], value: total, color: AREA_COLOR_HEX[a], area: a };
    }).filter((d) => d.value > 0);
  }, [byArea]);

  const totalAll = pieData.reduce((s, x) => s + x.value, 0);

  return (
    <div className="glass-card p-5 fade-in">
      <div className="mb-4">
        <h3 className="font-display text-base font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div style={{ height: 280 }}>
          {pieData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Sem dados.</div>
          ) : (
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} innerRadius={55} paddingAngle={3} label={(e) => `${e.value}`}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#dde3f0" }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="space-y-4 max-h-[320px] overflow-y-auto scrollbar-thin pr-2">
          {ALL_AREAS.map((area) => {
            const m = byArea[area];
            if (!m || m.size === 0) return null;
            const members = Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
            const subTotal = members.reduce((s, [, v]) => s + v, 0);
            const max = members[0][1];
            return (
              <div key={area}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: AREA_COLOR_HEX[area] }}>
                    {AREA_LABEL[area]}
                  </span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {subTotal} {totalAll ? `(${((subTotal / totalAll) * 100).toFixed(0)}%)` : ""}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {members.map(([name, count]) => {
                    const pct = max ? (count / max) * 100 : 0;
                    return (
                      <div key={name} className="group">
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="text-foreground/90">{name}</span>
                          <span className="text-muted-foreground tabular-nums">{count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: AREA_COLOR_HEX[area], opacity: 0.7 }} />
                        </div>
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
  // Threads created = unique opener per case (first message author or first participant)
  const created = useMemo(() => {
    const out: { username: string }[] = [];
    for (const r of rows) {
      const msgs = messagesMap[r.id] || [];
      const opener = msgs[0]?.author_username;
      if (opener) out.push({ username: opener });
    }
    return out;
  }, [rows, messagesMap]);

  // Threads participated = unique (case_id, username) pair
  const participated = useMemo(() => {
    const out: { username: string }[] = [];
    for (const r of rows) {
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
  }, [rows, messagesMap]);

  return (
    <div className="grid grid-cols-1 gap-6">
      <Section
        title="Threads participadas"
        subtitle="Cada par único (caso, pessoa) — mostra alcance da participação"
        items={participated}
      />
      <Section
        title="Threads criadas"
        subtitle="Quem abriu o caso (primeiro autor da thread)"
        items={created}
      />
    </div>
  );
}

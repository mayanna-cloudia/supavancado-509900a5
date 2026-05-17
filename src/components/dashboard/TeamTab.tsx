import { useMemo, useState } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { Trophy, ChevronDown, Check, User } from "lucide-react";
import type { CaseRow, Message } from "@/lib/supabase";
import { lookupMember, AREA_LABEL, AREA_COLOR_HEX, AREA_BADGE, ALL_AREAS, type Area } from "@/lib/team";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
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

// Verifica se alguém de OUTRA área (resolutiva) participou da thread
function hasOtherTeamParticipation(msgs: Message[] | undefined, ownArea: Area | null): boolean {
  if (!msgs || msgs.length === 0) return false;
  return msgs.some((m) => {
    const member = lookupMember(m.author_username);
    if (!member.area) return false;
    if (member.area === ownArea) return false;
    return member.area === "Chatbot" || member.area === "AM" || member.area === "SuporteN2";
  });
}

type PersonStats = {
  resolvedEnd2End: number;  // resolveu sozinha (ela = resolver + sem triagem)
  triages: number;          // foi first_responder mas outro resolveu
  totalCases: number;       // resolvedEnd2End + triages
  pct: number;              // % resolveu sozinha
};

function computePersonStats(
  username: string,
  rows: CaseRow[],
  messagesMap: Record<number, Message[]>,
): PersonStats {
  const key = username.toLowerCase();
  const info = lookupMember(username);
  let resolvedEnd2End = 0;
  let triages = 0;

  for (const r of rows) {
    const a = r.analysis;
    if (!a) continue;

    const resolverUser = (a.resolver_name || "").toLowerCase();
    const firstUser = (a.first_responder_name || "").toLowerCase();
    const msgs = messagesMap[r.id];

    const isResolver = a.resolved && resolverUser === key;
    const isFirstResponder = firstUser === key;

    if (isResolver) {
      const otherTouched = hasOtherTeamParticipation(msgs, info.area);
      if (!otherTouched) {
        resolvedEnd2End++;
      } else if (isFirstResponder) {
        // resolveu, mas outro time também atuou — conta como triagem
        triages++;
      }
    } else if (isFirstResponder && a.resolved && resolverUser && resolverUser !== key) {
      // ela abriu/respondeu primeiro, outro resolveu
      triages++;
    }
  }

  const totalCases = resolvedEnd2End + triages;
  const pct = totalCases > 0 ? Math.round((resolvedEnd2End / totalCases) * 100) : 0;
  return { resolvedEnd2End, triages, totalCases, pct };
}

// Lista de pessoas que aparecem como resolver ou first_responder
function listAvailablePeople(rows: CaseRow[]): { username: string; name: string; area: Area | null }[] {
  const map = new Map<string, { username: string; name: string; area: Area | null }>();
  for (const r of rows) {
    const a = r.analysis;
    if (!a) continue;
    for (const u of [a.resolver_name, a.first_responder_name]) {
      if (!u) continue;
      const key = u.toLowerCase();
      if (!map.has(key)) {
        const info = lookupMember(u);
        if (info.area) {
          map.set(key, { username: key, name: info.name || u, area: info.area });
        }
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function PersonPicker({
  people,
  selected,
  onChange,
}: {
  people: { username: string; name: string; area: Area | null }[];
  selected: string | null;
  onChange: (username: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    const order: Area[] = ["SuporteN2", "Chatbot", "AM"];
    const groups: Record<string, typeof people> = {};
    for (const p of people) {
      const key = p.area || "Outros";
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }
    return order
      .map((a) => ({ area: a, people: groups[a] || [] }))
      .filter((g) => g.people.length > 0);
  }, [people]);

  const selectedPerson = people.find((p) => p.username === selected);
  const label = selectedPerson ? selectedPerson.name : "Selecione uma pessoa";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Selecionar pessoa para ver métricas"
          aria-expanded={open}
          className={cn(
            "h-10 inline-flex items-center justify-between gap-2 rounded-md border bg-surface px-3 text-sm transition-colors w-full sm:w-[280px]",
            "border-border text-foreground hover:border-[var(--brand-blue)]/60",
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <User className="h-4 w-4 opacity-70" />
            <span className={cn("truncate", !selectedPerson && "text-muted-foreground")}>{label}</span>
          </span>
          <ChevronDown className="h-4 w-4 opacity-60 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[280px] p-0 bg-card border-border"
      >
        <Command shouldFilter={true}>
          <CommandInput placeholder="Buscar pessoa..." className="h-9 text-xs" />
          <CommandList className="max-h-[320px]">
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
              Ninguém encontrado
            </CommandEmpty>
            {grouped.map((g, idx) => (
              <div key={g.area}>
                {idx > 0 && <CommandSeparator />}
                <CommandGroup
                  heading={
                    <span
                      className="text-[10px] uppercase tracking-wider font-semibold"
                      style={{ color: AREA_COLOR_HEX[g.area] }}
                    >
                      {AREA_LABEL[g.area]}
                    </span>
                  }
                >
                  {g.people.map((p) => (
                    <CommandItem
                      key={p.username}
                      value={p.name.toLowerCase()}
                      onSelect={() => {
                        onChange(p.username);
                        setOpen(false);
                      }}
                      className="text-xs"
                    >
                      <span className="flex-1">{p.name}</span>
                      {selected === p.username && <Check className="h-3.5 w-3.5" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </div>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function MetricCardBig({
  label,
  description,
  value,
  color,
  suffix = "",
}: {
  label: string;
  description: string;
  value: number;
  color: string;
  suffix?: string;
}) {
  return (
    <div className="glass-card p-5 fade-in relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: color }} />
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </p>
      <p className="mt-1 text-xs text-muted-foreground leading-snug min-h-[32px]">
        {description}
      </p>
      <div className="mt-3 font-display text-4xl font-semibold tabular-nums" style={{ color }}>
        {value}{suffix}
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
  const people = useMemo(() => listAvailablePeople(rows), [rows]);
  const [selected, setSelected] = useState<string | null>(null);

  const stats = useMemo(() => {
    if (!selected) return null;
    return computePersonStats(selected, rows, messagesMap);
  }, [selected, rows, messagesMap]);

  const selectedPerson = people.find((p) => p.username === selected);

  return (
    <div className="glass-card p-5 fade-in">
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div className="flex items-center gap-2">
          <div
            className="rounded-lg p-2"
            style={{ background: "color-mix(in oklab, var(--brand-blue) 14%, transparent)" }}
          >
            <Trophy className="h-4 w-4" style={{ color: "var(--brand-blue)" }} />
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">Métricas individuais</h3>
            <p className="text-xs text-muted-foreground">
              Selecione uma pessoa para ver o desempenho no período
            </p>
          </div>
        </div>

        <PersonPicker
          people={people}
          selected={selected}
          onChange={setSelected}
        />
      </div>

      {!selected || !stats ? (
        <div className="rounded-md border border-dashed border-border bg-surface/30 p-8 text-center">
          <User className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-foreground/80">Nenhuma pessoa selecionada</p>
          <p className="text-xs text-muted-foreground mt-1">
            Use o seletor acima para ver as métricas individuais
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm text-foreground">Mostrando dados de</span>
            <span className="text-sm font-medium text-foreground">{selectedPerson?.name}</span>
            {selectedPerson?.area && (
              <span className={cn("px-2 py-0.5 rounded text-[10px] font-semibold border", AREA_BADGE[selectedPerson.area])}>
                {AREA_LABEL[selectedPerson.area]}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCardBig
              label="Resolvidos do início ao fim"
              description="Casos que você resolveu sem ajuda de outro time (Chatbot ou AM)"
              value={stats.resolvedEnd2End}
              color="var(--brand-green)"
            />
            <MetricCardBig
              label="Triagens"
              description="Casos que você atendeu primeiro, mas o resolvedor final foi outro time"
              value={stats.triages}
              color="var(--brand-blue)"
            />
            <MetricCardBig
              label="Taxa de resolução direta"
              description="Quanto você resolveu sozinho(a), do total de casos que atuou"
              value={stats.pct}
              color="#715AFF"
              suffix="%"
            />
          </div>

          <div className="mt-4 text-xs text-muted-foreground">
            Total no período: <span className="text-foreground font-medium tabular-nums">{stats.totalCases}</span> caso(s) atendido(s) por {selectedPerson?.name}
          </div>
        </>
      )}
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
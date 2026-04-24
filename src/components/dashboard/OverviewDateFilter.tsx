import { useMemo, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { format, startOfDay, startOfMonth, startOfYear, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type DateRange = { from?: Date; to?: Date };
export type PresetKey = "today" | "7d" | "30d" | "month" | "year" | "custom";

export const DEFAULT_PRESET: PresetKey = "year";

// Data mínima permitida: 1 de janeiro do ano atual
export function minAllowedDate(): Date {
  return startOfYear(new Date());
}

function clampFrom(d: Date): Date {
  const min = minAllowedDate();
  return d < min ? min : d;
}

export function rangeForPreset(preset: PresetKey): DateRange {
  const now = new Date();
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  switch (preset) {
    case "today":   return { from: clampFrom(startOfDay(now)), to: end };
    case "7d":      return { from: clampFrom(startOfDay(subDays(now, 6))), to: end };
    case "30d":     return { from: clampFrom(startOfDay(subDays(now, 29))), to: end };
    case "month":   return { from: clampFrom(startOfMonth(now)), to: end };
    case "year":    return { from: startOfYear(now), to: end };
    case "custom":  return {};
  }
}

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "7d",    label: "7 dias" },
  { key: "30d",   label: "30 dias" },
  { key: "month", label: "Este mês" },
  { key: "year",  label: "Este ano" },
];

type Props = {
  preset: PresetKey;
  range: DateRange;
  onChange: (preset: PresetKey, range: DateRange) => void;
};

export function OverviewDateFilter({ preset, range, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const minDate = useMemo(() => minAllowedDate(), []);

  const indicator = useMemo(() => {
    if (!range.from && !range.to) return "Mostrando todos os dados";
    const f = range.from ? format(range.from, "dd/MM/yyyy", { locale: ptBR }) : "—";
    const t = range.to ? format(range.to, "dd/MM/yyyy", { locale: ptBR }) : "hoje";
    return `Mostrando dados de ${f} até ${t}`;
  }, [range]);

  return (
    <div className="flat-card flat-card-interactive" style={{ padding: "12px 16px" }}>
      <div className="flex flex-wrap items-center gap-2">
        <CalendarIcon size={14} className="text-muted-foreground" />
        <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground mr-1">
          Período
        </span>

        {PRESETS.map((p) => {
          const active = preset === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange(p.key, rangeForPreset(p.key))}
              aria-pressed={active}
              aria-label={`Filtrar por ${p.label}`}
              className={cn(
                "rounded-md text-[12px] font-medium border transition-all duration-200",
                active
                  ? "text-white border-transparent"
                  : "bg-transparent text-muted-foreground border-border hover:text-foreground hover:bg-surface"
              )}
              style={{
                padding: "6px 12px",
                background: active ? "#256EFF" : undefined,
                borderColor: active ? "#256EFF" : undefined,
              }}
            >
              {p.label}
            </button>
          );
        })}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-pressed={preset === "custom"}
              aria-label="Selecionar período personalizado"
              className={cn(
                "rounded-md text-[12px] font-medium border transition-all duration-200 inline-flex items-center gap-1.5",
                preset === "custom"
                  ? "text-white border-transparent"
                  : "bg-transparent text-muted-foreground border-border hover:text-foreground hover:bg-surface"
              )}
              style={{
                padding: "6px 12px",
                background: preset === "custom" ? "#256EFF" : undefined,
                borderColor: preset === "custom" ? "#256EFF" : undefined,
              }}
            >
              <CalendarIcon size={12} />
              {preset === "custom" && range.from
                ? `${format(range.from, "dd/MM", { locale: ptBR })} → ${range.to ? format(range.to, "dd/MM", { locale: ptBR }) : "—"}`
                : "Personalizado"}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 bg-card border-border" align="start">
            <Calendar
              mode="range"
              selected={{ from: range.from, to: range.to }}
              onSelect={(r) => {
                const clampedFrom = r?.from && r.from < minDate ? minDate : r?.from;
                onChange("custom", { from: clampedFrom, to: r?.to });
              }}
              disabled={(date) => date < minDate}
              fromDate={minDate}
              numberOfMonths={2}
              locale={ptBR}
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground tabular-nums">
        {indicator}
        {preset !== "year" && (
          <span className="ml-2 opacity-60">
            · dados disponíveis desde {format(minDate, "dd/MM/yyyy", { locale: ptBR })}
          </span>
        )}
      </p>
    </div>
  );
}

export function filterByDateRange<T extends { opened_at: string }>(rows: T[], range: DateRange): T[] {
  if (!range.from && !range.to) return rows;
  const fromMs = range.from ? range.from.getTime() : -Infinity;
  const toMs = range.to ? range.to.getTime() : Infinity;
  return rows.filter((r) => {
    const t = new Date(r.opened_at).getTime();
    return t >= fromMs && t <= toMs;
  });
}
import { cn } from "@/lib/utils";

export type TabKey = "overview" | "cases" | "sla" | "team" | "metrics";

const TABS: { key: TabKey; label: string; short: string }[] = [
  { key: "overview", label: "Visão Geral",     short: "Visão" },
  { key: "cases",    label: "Todos os Casos",  short: "Casos" },
  { key: "sla",      label: "SLA",             short: "SLA" },
  { key: "team",     label: "Time",            short: "Time" },
  { key: "metrics",  label: "Métricas",        short: "Métricas" },
];

export function Tabs({ value, onChange }: { value: TabKey; onChange: (k: TabKey) => void }) {
  return (
    <div className="border-b border-border bg-background/70 backdrop-blur sticky top-[57px] sm:top-[73px] z-20">
      <div className="mx-auto flex max-w-[1600px] gap-1 px-3 sm:px-6 overflow-x-auto no-scrollbar">
        {TABS.map((t) => {
          const active = t.key === value;
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              className={cn(
                "relative shrink-0 px-3 sm:px-4 py-3 text-xs sm:text-sm font-medium transition-all duration-200",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface/40 rounded-t-md"
              )}
            >
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.short}</span>
              {active && (
                <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-gradient-to-r from-[var(--brand-blue)] to-[var(--brand-purple)] animate-[fade-in_0.25s_ease-out]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

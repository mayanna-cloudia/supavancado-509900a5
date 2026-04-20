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
    <div
      className="border-b border-border sticky z-20"
      style={{
        top: 57,
        background: "color-mix(in oklab, var(--background) 80%, transparent)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div className="mx-auto flex max-w-[1600px] gap-0 px-3 sm:px-6 overflow-x-auto no-scrollbar">
        {TABS.map((t) => {
          const active = t.key === value;
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              className={cn(
                "relative shrink-0 text-[13px] font-medium transition-colors duration-200",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              style={{ padding: "12px 14px" }}
            >
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.short}</span>
              {active && (
                <span
                  className="absolute inset-x-[14px] -bottom-px"
                  style={{ height: 2, background: "var(--brand-blue)" }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

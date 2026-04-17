import { cn } from "@/lib/utils";

export type TabKey = "overview" | "cases" | "sla" | "team";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Visão Geral" },
  { key: "cases",    label: "Casos em Tempo Real" },
  { key: "sla",      label: "SLA" },
  { key: "team",     label: "Time" },
];

export function Tabs({ value, onChange }: { value: TabKey; onChange: (k: TabKey) => void }) {
  return (
    <div className="border-b border-border bg-background/60 backdrop-blur sticky top-[73px] z-20">
      <div className="mx-auto flex max-w-[1600px] gap-1 px-6">
        {TABS.map((t) => {
          const active = t.key === value;
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              className={cn(
                "relative px-4 py-3 text-sm font-medium transition-colors",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
              {active && (
                <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-gradient-to-r from-[var(--brand-blue)] to-[var(--brand-purple)]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

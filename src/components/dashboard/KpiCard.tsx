import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "blue" | "green" | "orange" | "purple" | "yellow" | "red";
  icon?: React.ReactNode;
};

const ACCENT_CLASS: Record<NonNullable<Props["accent"]>, string> = {
  blue:   "from-[oklch(0.78_0.14_230/0.18)] to-transparent text-[var(--brand-blue)]",
  green:  "from-[oklch(0.72_0.17_162/0.18)] to-transparent text-[var(--brand-green)]",
  orange: "from-[oklch(0.74_0.18_47/0.18)]  to-transparent text-[var(--brand-orange)]",
  purple: "from-[oklch(0.65_0.22_295/0.18)] to-transparent text-[var(--brand-purple)]",
  yellow: "from-[oklch(0.80_0.16_80/0.18)]  to-transparent text-[var(--brand-yellow)]",
  red:    "from-[oklch(0.65_0.22_25/0.18)]  to-transparent text-[var(--brand-red)]",
};

export function KpiCard({ label, value, hint, accent = "blue", icon }: Props) {
  return (
    <div className="glass-card relative overflow-hidden p-5 fade-in">
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-60", ACCENT_CLASS[accent])} />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-2 font-display text-3xl font-semibold text-foreground tabular-nums">
            {value}
          </p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {icon && (
          <div className={cn("rounded-lg border border-border/60 bg-surface/60 p-2", ACCENT_CLASS[accent])}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

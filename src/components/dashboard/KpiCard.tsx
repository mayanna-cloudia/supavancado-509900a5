import { cn } from "@/lib/utils";

type Accent = "blue" | "green" | "orange" | "purple" | "yellow" | "red";

type Props = {
  label: string;
  value: string | number;
  hint?: string;
  accent?: Accent;
  icon?: React.ReactNode;
};

const ACCENT_VAR: Record<Accent, string> = {
  blue:   "var(--brand-blue)",
  green:  "var(--brand-green)",
  orange: "var(--brand-orange)",
  purple: "var(--brand-purple)",
  yellow: "var(--brand-yellow)",
  red:    "var(--brand-red)",
};

export function KpiCard({ label, value, hint, accent = "blue", icon }: Props) {
  const color = ACCENT_VAR[accent];
  return (
    <div
      className="relative overflow-hidden flat-card flat-card-interactive fade-in"
      style={{ padding: "16px 18px", paddingLeft: 21 }}
    >
      {/* Vertical accent bar */}
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0"
        style={{ width: 3, background: color }}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="text-[10px] font-medium text-muted-foreground"
            style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}
          >
            {label}
          </p>
          <p
            className="mt-2 font-display font-bold tabular-nums leading-none truncate"
            style={{ fontSize: 32, color }}
          >
            {value}
          </p>
          {hint && (
            <p className="mt-2 text-[11px] text-muted-foreground truncate">{hint}</p>
          )}
        </div>
        {icon && (
          <div
            className={cn("rounded-md p-2 shrink-0")}
            style={{
              background: `color-mix(in oklab, ${color} 12%, transparent)`,
              color,
            }}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

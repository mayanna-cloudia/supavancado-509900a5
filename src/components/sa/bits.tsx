import { Link } from "@tanstack/react-router";
import { ArrowRight, ExternalLink, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import type { CaseStatus, Priority } from "@/lib/supabase";

type Tone = "brand" | "red" | "orange" | "yellow" | "green" | "gray";

const PILL: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand-text",
  red: "bg-red-bg text-red",
  orange: "bg-orange-bg text-orange",
  yellow: "bg-yellow-bg text-yellow",
  green: "bg-green-bg text-green",
  gray: "bg-hover text-muted-foreground",
};

export function Pill({
  tone,
  children,
  className = "",
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${PILL[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Prioridade da tag do Discord: P1 amarelo (4 h), P2 laranja (2 h), P3 vermelho (30 min, crítico). */
export function PrioPill({ p, long = false }: { p: Priority | null; long?: boolean }) {
  if (!p) return <Pill tone="gray">sem P</Pill>;
  const tone: Tone = p === "P3" ? "red" : p === "P2" ? "orange" : "yellow";
  return (
    <Pill tone={tone} className="min-w-[40px] justify-center">
      {long && p === "P3" ? "P3 · crítico" : p}
    </Pill>
  );
}

export function StatusPill({
  status,
  waitingClient,
}: {
  status: CaseStatus;
  waitingClient?: boolean;
}) {
  if (status !== "aberto") return <Pill tone="green">Resolvido</Pill>;
  return waitingClient ? (
    <Pill tone="yellow">Esperando a clínica</Pill>
  ) : (
    <Pill tone="brand">Esperando o time</Pill>
  );
}

const BAR_GRAD: Record<"brand" | "red" | "orange" | "yellow", string> = {
  brand: "var(--grad-brand-bar)",
  red: "var(--grad-red-bar)",
  orange: "var(--grad-orange-bar)",
  yellow: "var(--grad-yellow-bar)",
};

/** Barra presa na borda esquerda do card, com a ponta direita arredondada. Tamanho = quantidade. */
export function FlagBar({
  value,
  max,
  unit,
  tone = "brand",
  min = 70,
  span = 90,
}: {
  value: number;
  max: number;
  unit?: string;
  tone?: keyof typeof BAR_GRAD;
  min?: number;
  span?: number;
}) {
  const width = Math.round(min + (max > 0 ? value / max : 0) * span);
  return (
    <div
      className="-ml-[18px] flex h-10 shrink-0 items-center justify-end rounded-r-full pr-3.5 font-bold text-white shadow-[0_2px_6px_rgba(0,0,0,0.10)]"
      style={{ width, background: BAR_GRAD[tone] }}
    >
      <span className="text-lg">{value}</span>
      {unit && <span className="ml-1 text-[11px] font-medium">{unit}</span>}
    </div>
  );
}

export function SlaBar({ pct, label }: { pct: number; label: string }) {
  const late = pct >= 100;
  const warn = pct >= 75 && !late;
  const bg = late
    ? "linear-gradient(90deg,#e5484d,#b42318)"
    : warn
      ? "linear-gradient(90deg,#f5a524,#c2570c)"
      : "linear-gradient(90deg,#3760ff,#6b63fd)";
  return (
    <div className="h-[5px] overflow-hidden rounded-full bg-bar" role="img" aria-label={label}>
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.min(pct, 100)}%`, background: bg }}
      />
    </div>
  );
}

export function DiscordIconLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title="Abrir no Discord"
      aria-label="Abrir no Discord"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-foreground"
    >
      <ExternalLink className="h-4 w-4" />
    </a>
  );
}

export function SeeMore({
  to,
  search,
  children,
}: {
  to: string;
  search?: Record<string, string>;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      search={search as never}
      className="mt-1 flex h-10 items-center justify-center gap-1.5 rounded-lg bg-brand-soft font-bold text-brand-text no-underline hover:text-brand-text"
    >
      {children}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

export function PageTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="m-0 text-xl font-bold">{title}</h1>
        {subtitle && <div className="max-w-[640px] text-muted-foreground">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

export function Loading({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      {label}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-lg bg-red-bg px-4 py-3 text-red">Erro ao carregar: {message}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-7 text-center text-muted-foreground">{children}</div>;
}

/** Campo de data "De/Até" com rótulo. */
export function DateField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-lg border border-border bg-card px-2.5 text-foreground"
      />
    </div>
  );
}

/** Data de hoje (Brasília) no formato do input date, deslocada em dias. */
export function isoDay(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

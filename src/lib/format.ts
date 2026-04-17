import { differenceInMinutes, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export function fmtDate(iso: string | null | undefined, pattern = "dd/MM/yyyy HH:mm") {
  if (!iso) return "—";
  try { return format(parseISO(iso), pattern, { locale: ptBR }); } catch { return "—"; }
}

export function fmtDuration(minutes: number | null | undefined): string {
  if (minutes == null || isNaN(minutes)) return "—";
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = minutes / 60;
  if (h < 24) return `${h.toFixed(1)} h`;
  const d = h / 24;
  return `${d.toFixed(1)} d`;
}

export function diffMinutes(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  try { return differenceInMinutes(parseISO(b), parseISO(a)); } catch { return null; }
}

// Week key like "2024-W03" - sortable chronologically
export function weekKey(iso: string): string {
  const d = parseISO(iso);
  const year = d.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const diffDays = Math.floor((d.getTime() - start) / 86400000);
  const week = Math.ceil((diffDays + ((new Date(start).getUTCDay() || 7))) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function weekLabel(key: string): string {
  // "2024-W03" -> "S03/24"
  const [y, w] = key.split("-W");
  return `S${w}/${y.slice(2)}`;
}

export function priorityColor(p: string | null | undefined): string {
  const v = (p || "").toUpperCase();
  if (v === "P1") return "var(--brand-yellow)";
  if (v === "P2") return "var(--brand-orange)";
  if (v === "P3") return "var(--brand-red)";
  return "var(--muted-foreground)";
}

export function priorityBadgeClass(p: string | null | undefined): string {
  const v = (p || "").toUpperCase();
  if (v === "P1") return "bg-[oklch(0.80_0.16_80/0.18)] text-[oklch(0.88_0.16_80)] border-[oklch(0.80_0.16_80/0.5)]";
  if (v === "P2") return "bg-[oklch(0.74_0.18_47/0.18)] text-[oklch(0.85_0.18_47)] border-[oklch(0.74_0.18_47/0.5)]";
  if (v === "P3") return "bg-[oklch(0.65_0.22_25/0.18)] text-[oklch(0.78_0.22_25)] border-[oklch(0.65_0.22_25/0.5)]";
  return "bg-muted/30 text-muted-foreground border-border";
}

// SLA targets in minutes (1st response) - per spec: P1=4h, P2=2h, P3=30min
export const SLA_MINUTES: Record<string, number> = {
  P1: 4 * 60,
  P2: 2 * 60,
  P3: 30,
};

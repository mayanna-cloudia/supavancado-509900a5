import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import type { CaseRow } from "./supabase";
import { isWithinSLA, SLA_MINUTES } from "./format";
import { lookupMember, normalizeResolverTeam, AREA_LABEL, type Area } from "./team";

// ----- Brazilian number formatters -----
function fmtDurationBR(minutes: number | null | undefined): string {
  if (minutes == null || isNaN(minutes)) return "";
  if (minutes < 60) return `${Math.round(minutes)}min`;
  const h = minutes / 60;
  if (h < 24) return `${h.toFixed(1).replace(".", ",")}h`;
  const d = h / 24;
  return `${d.toFixed(1).replace(".", ",")}d`;
}

function fmtFirstRespBR(minutes: number | null | undefined): string {
  if (minutes == null || isNaN(minutes)) return "";
  if (minutes < 60) return `${Math.round(minutes)}min`;
  return `${(minutes / 60).toFixed(1).replace(".", ",")}h`;
}

function fmtDateBR(iso: string | null | undefined): string {
  if (!iso) return "";
  try { return format(parseISO(iso), "dd/MM/yyyy HH:mm", { locale: ptBR }); }
  catch { return ""; }
}

// ----- CSV escape -----
function esc(v: unknown): string {
  if (v == null) return "";
  let s = String(v);
  // normalize line breaks → space (per spec)
  s = s.replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ").trim();
  if (/[",;]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function discordUrl(r: CaseRow): string {
  // Best-effort: if thread_id looks like a discord snowflake (numeric) build a public link
  const tid = r.thread_id != null ? String(r.thread_id) : "";
  if (!tid) return "";
  if (/^\d{15,}$/.test(tid)) return `https://discord.com/channels/${tid}`;
  return "";
}

function slaLabel(r: CaseRow): string {
  const fr = r.first_response_minutes ?? null;
  const p = (r.analysis?.priority || "").toUpperCase();
  if (fr == null || !SLA_MINUTES[p]) return "Não aplicável";
  return isWithinSLA(fr, p) ? "Sim" : "Não";
}

// ----- Columns -----
const COLUMNS = [
  "IDCLINIC",
  "Titulo",
  "Prioridade",
  "Categoria",
  "Modulo",
  "Status",
  "Data Abertura",
  "Data Ultima Atividade",
  "Duracao",
  "Numero de Mensagens",
  "Primeira Resposta",
  "Dentro do SLA",
  "Aberto Por",
  "Primeiro Respondente",
  "Resolvido Por",
  "Area Resolvedora",
  "Resumo IA",
  "Resolucao IA",
  "URL Discord",
];

function rowToCells(r: CaseRow): string[] {
  const a = r.analysis;
  const resolved = !!a?.resolved;
  const duration =
    r.closed_at
      ? (new Date(r.closed_at).getTime() - new Date(r.opened_at).getTime()) / 60000
      : r.last_activity_at
        ? (new Date(r.last_activity_at).getTime() - new Date(r.opened_at).getTime()) / 60000
        : null;

  const area = a
    ? (normalizeResolverTeam(a.resolver_team) || lookupMember(a.resolver_name).area)
    : null;

  return [
    r.idclinic || "",
    r.thread_title || "",
    (a?.priority || "").toUpperCase(),
    a?.category || "",
    a?.subcategory || "",
    resolved ? "Resolvido" : "Aberto",
    fmtDateBR(r.opened_at),
    fmtDateBR(r.last_activity_at),
    fmtDurationBR(duration),
    String(r.messages_count ?? 0),
    fmtFirstRespBR(r.first_response_minutes),
    slaLabel(r),
    a?.first_responder_name ? lookupMember(a.first_responder_name).name : "",
    a?.first_responder_name ? lookupMember(a.first_responder_name).name : "",
    a?.resolver_name ? lookupMember(a.resolver_name).name : "",
    area ? AREA_LABEL[area as Area] : "",
    a?.summary || "",
    a?.resolution || "",
    discordUrl(r),
  ].map(esc);
}

// Note: column 13 is "Aberto Por" and 14 "Primeiro Respondente".
// We don't reliably have the opener username for the CSV (would require messages map),
// so we duplicate first_responder_name for both if nothing better is available.
// The caller can pass an override via buildCSV options if desired.

export type CSVOptions = {
  openerByCaseId?: Record<number, string | null>; // optional opener name override
};

function buildCSV(rows: CaseRow[], opts: CSVOptions = {}): string {
  const header = COLUMNS.map(esc).join(",");
  const lines = rows.map((r) => {
    const cells = rowToCells(r);
    if (opts.openerByCaseId) {
      const opener = opts.openerByCaseId[r.id];
      if (opener) cells[12] = esc(lookupMember(opener).name);
      else cells[12] = "";
    }
    return cells.join(",");
  });
  return [header, ...lines].join("\r\n");
}

function timestampSuffix(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
}

export type ExportScope = "casos" | "sla" | "metricas";

export function exportCasesCSV(
  rows: CaseRow[],
  scope: ExportScope,
  opts: CSVOptions = {},
): void {
  if (!rows || rows.length === 0) {
    toast("Nenhum caso para exportar", {
      style: {
        background: "var(--card)",
        border: "1px solid color-mix(in oklab, var(--brand-orange) 50%, transparent)",
        color: "var(--brand-orange)",
      },
    });
    return;
  }

  if (rows.length > 100) {
    toast(`Exportando ${rows.length.toLocaleString("pt-BR")} casos…`, {
      duration: 1500,
    });
  }

  const csv = buildCSV(rows, opts);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cloudia-suporte-${scope}-${timestampSuffix()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  toast.success(`${rows.length.toLocaleString("pt-BR")} casos exportados com sucesso`, {
    duration: 3000,
    style: {
      background: "var(--card)",
      border: "1px solid color-mix(in oklab, var(--brand-green) 50%, transparent)",
      color: "var(--foreground)",
    },
  });
}

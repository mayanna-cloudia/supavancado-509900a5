import { useMemo, useState } from "react";
import { Calendar as CalendarIcon, Search, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { CaseRow } from "@/lib/supabase";
import { priorityBadgeClass, fmtFirstResponse, isWithinSLA } from "@/lib/format";
import { lookupMember, normalizeResolverTeam, AREA_BADGE, AREA_LABEL, type Area } from "@/lib/team";

export type Filters = {
  from?: Date;
  to?: Date;
  idclinic: string; // "all" or value
  priority: "all" | "P1" | "P2" | "P3";
  status: "all" | "open" | "resolved";
  category: string; // "all" or value
  resolver: string; // "all" or resolver_name
  search: string;
};

export const DEFAULT_FILTERS: Filters = {
  idclinic: "all",
  priority: "all",
  status: "all",
  category: "all",
  resolver: "all",
  search: "",
};

export function applyFilters(rows: CaseRow[], f: Filters): CaseRow[] {
  return rows.filter((r) => {
    if (f.from && new Date(r.opened_at) < f.from) return false;
    if (f.to) {
      const end = new Date(f.to); end.setHours(23, 59, 59, 999);
      if (new Date(r.opened_at) > end) return false;
    }
    if (f.idclinic !== "all" && r.idclinic !== f.idclinic) return false;
    if (f.priority !== "all" && (r.analysis?.priority || "").toUpperCase() !== f.priority) return false;
    if (f.status !== "all") {
      const resolved = !!r.analysis?.resolved;
      if (f.status === "resolved" && !resolved) return false;
      if (f.status === "open" && resolved) return false;
    }
    if (f.category !== "all" && (r.analysis?.category || "—") !== f.category) return false;
    if (f.resolver !== "all" && (r.analysis?.resolver_name || "") !== f.resolver) return false;
    if (f.search.trim()) {
      const q = f.search.toLowerCase();
      const blob = [
        r.idclinic, r.thread_title, r.analysis?.summary, r.analysis?.subcategory,
        r.analysis?.category, r.analysis?.resolver_name,
      ].filter(Boolean).join(" ").toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}

export function FiltersBar({
  rows, filters, onChange,
}: {
  rows: CaseRow[];
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const clinics = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.idclinic) set.add(r.idclinic);
    return Array.from(set).sort();
  }, [rows]);
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.analysis?.category) set.add(r.analysis.category);
    return Array.from(set).sort();
  }, [rows]);
  const resolvers = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.analysis?.resolver_name) set.add(r.analysis.resolver_name);
    return Array.from(set).sort();
  }, [rows]);

  const update = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const clear = () => onChange(DEFAULT_FILTERS);

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Date range */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="bg-surface border-border">
              <CalendarIcon className="h-3.5 w-3.5" />
              {filters.from ? format(filters.from, "dd/MM/yy", { locale: ptBR }) : "De"}
              {" → "}
              {filters.to ? format(filters.to, "dd/MM/yy", { locale: ptBR }) : "Até"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 bg-card border-border" align="start">
            <Calendar
              mode="range"
              selected={{ from: filters.from, to: filters.to }}
              onSelect={(r) => update({ from: r?.from, to: r?.to })}
              numberOfMonths={2}
              locale={ptBR}
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>

        {/* Clinic */}
        <Select value={filters.idclinic} onValueChange={(v) => update({ idclinic: v })}>
          <SelectTrigger className="h-8 w-[170px] bg-surface border-border text-xs">
            <SelectValue placeholder="IDCLINIC" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border max-h-[300px]">
            <SelectItem value="all">Todos os clientes</SelectItem>
            {clinics.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Category */}
        <Select value={filters.category} onValueChange={(v) => update({ category: v })}>
          <SelectTrigger className="h-8 w-[200px] bg-surface border-border text-xs">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border max-h-[300px]">
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Resolver */}
        <Select value={filters.resolver} onValueChange={(v) => update({ resolver: v })}>
          <SelectTrigger className="h-8 w-[190px] bg-surface border-border text-xs">
            <SelectValue placeholder="Quem resolveu" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border max-h-[300px]">
            <SelectItem value="all">Quem resolveu (todos)</SelectItem>
            {resolvers.map((r) => (
              <SelectItem key={r} value={r}>{lookupMember(r).name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            placeholder="Buscar título, IDCLINIC, resumo…"
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
            className="h-8 w-full rounded-md bg-surface border border-border pl-8 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[var(--brand-blue)]"
          />
        </div>

        <Button variant="ghost" size="sm" onClick={clear} className="text-xs text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
          Limpar
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Prioridade</span>
          {(["all", "P1", "P2", "P3"] as const).map((p) => (
            <button
              key={p}
              onClick={() => update({ priority: p })}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium border transition-all",
                filters.priority === p
                  ? p === "P1" ? "bg-[var(--brand-yellow)]/20 border-[var(--brand-yellow)]/60 text-[var(--brand-yellow)]"
                    : p === "P2" ? "bg-[var(--brand-orange)]/20 border-[var(--brand-orange)]/60 text-[var(--brand-orange)]"
                    : p === "P3" ? "bg-[var(--brand-red)]/20 border-[var(--brand-red)]/60 text-[var(--brand-red)]"
                    : "bg-[var(--brand-blue)]/20 border-[var(--brand-blue)]/60 text-[var(--brand-blue)]"
                  : "bg-surface border-border text-muted-foreground hover:text-foreground"
              )}
            >{p === "all" ? "Todos" : p}</button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Status</span>
          {([
            { v: "all", label: "Todos", color: "var(--brand-blue)" },
            { v: "open", label: "Aberto", color: "var(--brand-orange)" },
            { v: "resolved", label: "Resolvido", color: "var(--brand-green)" },
          ] as const).map((s) => (
            <button
              key={s.v}
              onClick={() => update({ status: s.v })}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium border transition-all",
                filters.status === s.v
                  ? "border-current"
                  : "bg-surface border-border text-muted-foreground hover:text-foreground"
              )}
              style={filters.status === s.v ? { color: s.color, background: `color-mix(in oklab, ${s.color} 18%, transparent)` } : undefined}
            >{s.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CasesTable({ rows, onRowClick }: { rows: CaseRow[]; onRowClick: (r: CaseRow) => void }) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead className="bg-surface/60 border-b border-border">
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-medium">IDCLINIC</th>
              <th className="px-4 py-3 font-medium">Título</th>
              <th className="px-3 py-3 font-medium">Prio</th>
              <th className="px-3 py-3 font-medium">Categoria</th>
              <th className="px-3 py-3 font-medium">Módulo</th>
              <th className="px-4 py-3 font-medium">Resumo IA</th>
              <th className="px-3 py-3 font-medium">1ª Resp.</th>
              <th className="px-3 py-3 font-medium">Resolvido por</th>
              <th className="px-3 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">Nenhum caso encontrado com os filtros atuais.</td></tr>
            )}
            {rows.slice(0, 500).map((r) => {
              const a = r.analysis;
              const resolved = !!a?.resolved;
              const team = a ? (normalizeResolverTeam(a.resolver_team) || lookupMember(a.resolver_name).area) : null;
              const resolverDisplay = a?.resolver_name ? lookupMember(a.resolver_name).name : "—";
              return (
                <tr
                  key={r.id}
                  onClick={() => onRowClick(r)}
                  className="border-b border-border/40 hover:bg-surface/40 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs text-foreground/90">{r.idclinic || "—"}</td>
                  <td className="px-4 py-3 max-w-[280px] truncate text-foreground" title={r.thread_title || ""}>
                    {r.thread_title || "(sem título)"}
                  </td>
                  <td className="px-3 py-3">
                    {a?.priority ? (
                      <span className={cn("px-2 py-0.5 rounded-md text-[11px] font-semibold border", priorityBadgeClass(a.priority))}>
                        {a.priority.toUpperCase()}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-3 text-xs text-foreground/80 max-w-[140px] truncate" title={a?.category || ""}>{a?.category || "—"}</td>
                  <td className="px-3 py-3 text-xs text-foreground/70 max-w-[140px] truncate" title={a?.subcategory || ""}>{a?.subcategory || "—"}</td>
                  <td className="px-4 py-3 max-w-[320px] truncate text-xs text-muted-foreground" title={a?.summary || ""}>
                    {a?.summary || <span className="italic">aguardando análise</span>}
                  </td>
                  <td className="px-3 py-3 text-xs tabular-nums">
                    {(() => {
                      const fr = r.first_response_minutes ?? null;
                      const ok = isWithinSLA(fr, a?.priority);
                      const color =
                        ok === true ? "var(--brand-green)" : ok === false ? "var(--brand-red)" : undefined;
                      return (
                        <span style={color ? { color } : undefined} className={cn("font-semibold", color ? "" : "text-foreground/80")}>
                          {fmtFirstResponse(fr)}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-3">
                    {team ? (
                      <span className={cn("px-2 py-0.5 rounded-md text-[11px] font-medium border", AREA_BADGE[team as Area])}>
                        {resolverDisplay}
                      </span>
                    ) : <span className="text-xs text-muted-foreground">{resolverDisplay}</span>}
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn(
                      "px-2 py-0.5 rounded-md text-[11px] font-semibold border",
                      resolved
                        ? "bg-[var(--brand-green)]/15 text-[var(--brand-green)] border-[var(--brand-green)]/40"
                        : "bg-[var(--brand-orange)]/15 text-[var(--brand-orange)] border-[var(--brand-orange)]/40"
                    )}>
                      {resolved ? "Resolvido" : "Aberto"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 500 && (
        <div className="px-4 py-2 text-xs text-muted-foreground text-center border-t border-border bg-surface/40">
          Exibindo 500 de {rows.length.toLocaleString("pt-BR")} resultados — refine os filtros para ver mais.
        </div>
      )}
    </div>
  );
}

export { AREA_LABEL };

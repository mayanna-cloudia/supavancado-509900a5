import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Header } from "@/components/dashboard/Header";
import { Tabs, type TabKey } from "@/components/dashboard/Tabs";
import { OverviewTab } from "@/components/dashboard/OverviewTab";
import { CasesTable, FiltersBar, applyFilters, DEFAULT_FILTERS, type Filters } from "@/components/dashboard/CasesTable";
import { CaseDetailModal } from "@/components/dashboard/CaseDetailModal";
import { SLATab } from "@/components/dashboard/SLATab";
import { TeamTab } from "@/components/dashboard/TeamTab";
import { MetricsTab } from "@/components/dashboard/MetricsTab";
import { useCloudiaData } from "@/lib/useCloudiaData";
import type { CaseRow } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<CaseRow | null>(null);

  const { rows, messages, loading, error, lastEvent, refresh } = useCloudiaData();

  const filtered = useMemo(() => applyFilters(rows, filters), [rows, filters]);

  const live = !error && !loading;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header live={live} lastEvent={lastEvent} />
      <Tabs value={tab} onChange={setTab} />

      <main className="mx-auto max-w-[1600px] px-6 py-6">
        {error && (
          <div className="mb-4 rounded-lg border border-[var(--brand-red)]/40 bg-[var(--brand-red)]/10 px-4 py-3 text-sm text-[var(--brand-red)]">
            Erro ao conectar com o Supabase: {error}
          </div>
        )}

        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-32 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Carregando dados em tempo real…
          </div>
        ) : (
          <>
            {tab === "overview" && <OverviewTab rows={rows} />}

            {tab === "cases" && (
              <div className="space-y-4">
                <FiltersBar rows={rows} filters={filters} onChange={setFilters} />
                <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                  <span>
                    {filtered.length.toLocaleString("pt-BR")} de {rows.length.toLocaleString("pt-BR")} casos
                  </span>
                  <span>Atualização automática via Realtime</span>
                </div>
                <CasesTable rows={filtered} onRowClick={setSelected} />
              </div>
            )}

            {tab === "sla" && <SLATab rows={rows} onRowClick={setSelected} />}

            {tab === "team" && <TeamTab rows={rows} messagesMap={messages} />}

            {tab === "metrics" && (
              <MetricsTab rows={rows} messagesMap={messages} onRowClick={setSelected} />
            )}
          </>
        )}
      </main>

      <CaseDetailModal
        row={selected}
        messages={selected ? (messages[selected.id] || []) : []}
        onClose={() => setSelected(null)}
        onReanalyzed={refresh}
      />

      <footer className="mx-auto max-w-[1600px] px-6 py-6 text-center text-[11px] text-muted-foreground">
        Cloudia · Painel interno · {rows.length.toLocaleString("pt-BR")} casos sincronizados
      </footer>
    </div>
  );
}

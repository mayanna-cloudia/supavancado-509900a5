import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ExternalLink, Loader2, Paperclip } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { DateField, Empty, ErrorBox, Loading, PrioPill, StatusPill } from "@/components/sa/bits";
import { downloadCsv, toCsv } from "@/lib/csv";
import {
  loadCaseDetail,
  loadCasesPage,
  loadOpenBoard,
  PAGE_SIZE,
  useLoader,
  type CaseFilters,
} from "@/lib/data";
import { discordThreadUrl } from "@/lib/discord";
import { AREA_NAME, caseArea, fmtMinutes, fmtWhen, waitingInfo } from "@/lib/sla";
import type { CaseWithAnalysis, Message } from "@/lib/supabase";
import { lookupMember, isResolutive } from "@/lib/team";
import { useMounted } from "@/lib/prefs";

type Search = CaseFilters & { caso?: number };

/** Sem status na URL = só os abertos. */
const withDefaults = (s: Search): CaseFilters => ({ ...s, status: s.status ?? "abertos" });

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export const Route = createFileRoute("/casos")({
  head: () => ({ meta: [{ title: "Casos · Suporte Avançado" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: str(s.q),
    status: (["abertos", "todos", "resolvidos", "parados"] as const).find((x) => x === s.status),
    prioridade: (["P1", "P2", "P3"] as const).find((x) => x === s.prioridade),
    area: (["N2", "Chatbot", "AM"] as const).find((x) => x === s.area),
    idclinic: str(s.idclinic) ?? (typeof s.idclinic === "number" ? String(s.idclinic) : undefined),
    problema: str(s.problema),
    pessoa: str(s.pessoa),
    de: str(s.de),
    ate: str(s.ate),
    pagina: Number(s.pagina) > 1 ? Number(s.pagina) : undefined,
    caso: Number(s.caso) > 0 ? Number(s.caso) : undefined,
  }),
  component: CasesPage,
});

function CasesPage() {
  const search = Route.useSearch();
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { rows } = await loadCasesPage(withDefaults(search), true);
      const csv = toCsv(
        [
          "Caso",
          "Título",
          "IDCLINIC",
          "Prioridade",
          "Status",
          "Áreas",
          "Pessoas",
          "Aberto em",
          "Fechado em",
          "Categoria",
          "Módulo",
          "Problema",
          "Resumo",
          "Resolução",
          "Resolvido por",
          "1ª resposta (min úteis)",
        ],
        rows.map((r) => [
          r.id,
          r.thread_title,
          r.idclinic,
          r.priority,
          r.status,
          r.area_tags.join(", "),
          r.person_tags.join(", "),
          fmtWhen(r.opened_at),
          r.closed_at ? fmtWhen(r.closed_at) : "",
          r.analyses?.category,
          r.analyses?.subcategory,
          r.analyses?.problem_label,
          r.analyses?.summary,
          r.analyses?.resolution,
          r.analyses?.resolver_name,
          r.analyses?.first_response_minutes,
        ]),
      );
      downloadCsv(`casos-suporte-avancado.csv`, csv);
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppShell
      actions={
        <button
          type="button"
          onClick={exportCsv}
          disabled={exporting}
          className="flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 font-medium text-foreground"
        >
          {exporting && <Loader2 className="h-4 w-4 animate-spin" />}
          Exportar CSV
        </button>
      }
    >
      <Cases />
    </AppShell>
  );
}

function Cases() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/casos" });
  const mounted = useMounted();
  const set = (patch: Partial<Search>) =>
    navigate({ search: (prev) => ({ ...prev, pagina: undefined, ...patch }), replace: true });

  const [q, setQ] = useState(search.q ?? "");
  useEffect(() => setQ(search.q ?? ""), [search.q]);
  useEffect(() => {
    const t = setTimeout(() => {
      if ((search.q ?? "") !== q.trim()) set({ q: q.trim() || undefined });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const filtersKey = JSON.stringify({ ...search, caso: undefined });
  // "Parados" depende das mensagens: usa a fila de casos abertos para saber quais passaram de 2 dias úteis
  const stuck = useLoader(async () => {
    if (search.status !== "parados") return null;
    const board = await loadOpenBoard();
    return board.cases
      .filter((c) => {
        const w = waitingInfo(
          c,
          (board.messagesByCase.get(c.id) ?? []) as Message[],
          c.analyses?.waiting_for,
        );
        return w.on === "team" && w.businessDays >= 2;
      })
      .map((c) => c.id);
  }, [search.status]);

  const list = useLoader(
    () =>
      search.status === "parados" && !stuck.data
        ? Promise.resolve(null)
        : loadCasesPage({ ...withDefaults(search), ids: stuck.data ?? undefined }),
    [filtersKey, stuck.data],
    ["cases", "analyses"],
  );

  const rows = list.data?.rows ?? [];
  const selectedId = search.caso ?? rows[0]?.id;
  const page = search.pagina ?? 1;
  const pages = Math.max(1, Math.ceil((list.data?.count ?? 0) / PAGE_SIZE));

  return (
    <>
      <div className="card flex flex-wrap items-end gap-2 px-3.5 py-3">
        <div className="flex flex-[1_1_240px] flex-col gap-1">
          <label htmlFor="q" className="text-xs text-muted-foreground">
            Buscar
          </label>
          <input
            id="q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Título, clínica ou texto da conversa"
            className="h-10 rounded-lg border border-border bg-card px-3 text-foreground"
          />
        </div>
        <Select
          id="f-status"
          label="Status"
          value={search.status ?? "abertos"}
          onChange={(v) => set({ status: v === "abertos" ? undefined : (v as Search["status"]) })}
          options={[
            ["abertos", "Abertos"],
            ["parados", "Parados há 2+ dias"],
            ["resolvidos", "Resolvidos"],
            ["todos", "Todos"],
          ]}
        />
        <Select
          id="f-prio"
          label="Prioridade"
          value={search.prioridade ?? ""}
          onChange={(v) => set({ prioridade: (v || undefined) as Search["prioridade"] })}
          options={[
            ["", "Todas"],
            ["P3", "P3 · crítico"],
            ["P2", "P2"],
            ["P1", "P1"],
          ]}
        />
        <Select
          id="f-area"
          label="Área"
          value={search.area ?? ""}
          onChange={(v) => set({ area: (v || undefined) as Search["area"] })}
          options={[
            ["", "Todas"],
            ["N2", "Suporte N2"],
            ["Chatbot", "Chatbot"],
            ["AM", "Área de Membros"],
          ]}
        />
        <div className="flex flex-[0_1_130px] flex-col gap-1">
          <label htmlFor="f-cli" className="text-xs text-muted-foreground">
            IDCLINIC
          </label>
          <input
            id="f-cli"
            inputMode="numeric"
            defaultValue={search.idclinic ?? ""}
            key={search.idclinic ?? ""}
            onBlur={(e) => set({ idclinic: e.target.value.trim() || undefined })}
            placeholder="Todas"
            className="h-10 rounded-lg border border-border bg-card px-3 text-foreground"
          />
        </div>
        <DateField
          id="de"
          label="De"
          value={search.de ?? ""}
          onChange={(v) => set({ de: v || undefined })}
        />
        <DateField
          id="ate"
          label="Até"
          value={search.ate ?? ""}
          onChange={(v) => set({ ate: v || undefined })}
        />
        {(search.problema || search.pessoa) && (
          <button
            type="button"
            onClick={() => set({ problema: undefined, pessoa: undefined })}
            className="h-10 rounded-lg border border-brand bg-brand-soft px-3 text-[13px] text-brand-text"
          >
            {search.problema ? `Problema: ${search.problema}` : `Pessoa: ${search.pessoa}`} ✕
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <section
          aria-label="Lista de casos"
          className="card min-w-0 flex-[999_1_520px] overflow-hidden"
        >
          <div className="flex justify-between border-b border-line px-4 py-2.5 text-[12.5px] text-muted-foreground">
            <span>{list.data ? `${list.data.count.toLocaleString("pt-BR")} casos` : "…"}</span>
            {list.loading && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
          {list.error && <ErrorBox message={list.error} />}
          {!mounted || (!list.data && list.loading) ? (
            <Loading />
          ) : rows.length === 0 ? (
            <Empty>Nenhum caso com esses filtros.</Empty>
          ) : null}
          {rows.map((c) => (
            <CaseRow
              key={c.id}
              c={c}
              on={c.id === selectedId}
              onPick={() =>
                navigate({ search: (prev) => ({ ...prev, caso: c.id }), replace: true })
              }
            />
          ))}
          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 text-[13px]">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => set({ pagina: page - 1 })}
                className="h-9 rounded-lg border border-border px-3 disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="text-muted-foreground">
                Página {page} de {pages}
              </span>
              <button
                type="button"
                disabled={page >= pages}
                onClick={() => set({ pagina: page + 1 })}
                className="h-9 rounded-lg border border-border px-3 disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          )}
        </section>

        <aside aria-label="Detalhe do caso" className="card flex min-w-0 flex-[1_1_380px] flex-col">
          {selectedId ? <CaseDetail id={selectedId} /> : <Empty>Escolha um caso na lista.</Empty>}
        </aside>
      </div>
    </>
  );
}

function Select({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="flex flex-[0_1_160px] flex-col gap-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-lg border border-border bg-card px-2.5 text-foreground"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

function CaseRow({ c, on, onPick }: { c: CaseWithAnalysis; on: boolean; onPick: () => void }) {
  const waitingClient = c.analyses?.waiting_for === "client";
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on}
      className={[
        "flex w-full flex-wrap items-center gap-x-3.5 gap-y-2 border-b border-line px-4 py-3 text-left text-foreground",
        on ? "bg-brand-soft shadow-[inset_3px_0_0_var(--brand)]" : "",
      ].join(" ")}
    >
      <PrioPill p={c.priority} />
      <span className="flex min-w-0 flex-[1_1_220px] flex-col">
        <span className="text-[15px] font-medium">{c.thread_title}</span>
        <span className="text-[12.5px] text-muted-foreground">
          {c.idclinic ? `IDCLINIC ${c.idclinic}` : "sem IDCLINIC"} · {areaLabel(c)} ·{" "}
          {fmtWhen(c.opened_at)}
        </span>
      </span>
      <StatusPill status={c.status} waitingClient={waitingClient} />
    </button>
  );
}

function CaseDetail({ id }: { id: number }) {
  const detail = useLoader(() => loadCaseDetail(id), [id], ["messages", "analyses"]);
  if (detail.loading && !detail.data) return <Loading />;
  if (detail.error && !detail.data) return <ErrorBox message={detail.error} />;
  if (!detail.data) return null;
  const { case: c, messages } = detail.data;
  const a = c.analyses;

  return (
    <>
      <div className="flex flex-col gap-2 border-b border-line px-[18px] py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <PrioPill p={c.priority} long />
          <StatusPill status={c.status} waitingClient={a?.waiting_for === "client"} />
          {c.person_tags.map((t) => (
            <span key={t} className="rounded-full bg-hover px-2 py-0.5 text-xs">
              {t}
            </span>
          ))}
        </div>
        <h2 className="m-0 text-lg font-bold leading-snug">{c.thread_title}</h2>
        <div className="text-[12.5px] text-muted-foreground">
          {c.idclinic ? `IDCLINIC ${c.idclinic}` : "sem IDCLINIC"} · {areaLabel(c)} · aberto{" "}
          {fmtWhen(c.opened_at)}
          {a?.first_response_minutes != null
            ? ` · 1ª resposta ${fmtMinutes(a.first_response_minutes)}`
            : ""}
        </div>
        {a?.summary ? (
          <div>{a.summary}</div>
        ) : (
          <div className="text-muted-foreground">Ainda sem análise da IA.</div>
        )}
        {a?.resolution && (
          <div className="text-[13.5px]">
            <b>O que foi feito:</b> {a.resolution}
          </div>
        )}
        <a
          href={discordThreadUrl(c)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-[38px] items-center gap-1.5 self-start rounded-lg bg-[#3760ff] px-3.5 font-medium text-white no-underline hover:text-white"
        >
          <ExternalLink className="h-4 w-4" />
          Abrir no Discord
        </a>
      </div>
      <div className="flex flex-col gap-3.5 px-[18px] py-4">
        {messages.length === 0 && <Empty>Sem mensagens.</Empty>}
        {messages.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
      </div>
    </>
  );
}

function Bubble({ m }: { m: Message }) {
  const member = lookupMember(m.author_username);
  const ours = isResolutive(member.area);
  const initials = member.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const att = m.attachments ?? [];
  return (
    <div className="flex gap-2.5">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${ours ? "bg-[#0e7c6b]" : "bg-[#6b63fd]"}`}
      >
        {initials}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="text-[12.5px]">
          <b>{member.name}</b> <span className="text-muted-foreground">· {fmtWhen(m.sent_at)}</span>
        </div>
        {m.content && (
          <div
            className={`self-start whitespace-pre-wrap break-words rounded-[4px_12px_12px_12px] px-3 py-2 ${ours ? "bg-brand-soft" : "bg-hover"}`}
          >
            {m.content}
          </div>
        )}
        {att.length > 0 && (
          <a
            href={m.message_url ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 self-start rounded-full border border-border px-2.5 py-1 text-[12.5px] font-medium text-brand-text no-underline"
          >
            <Paperclip className="h-3.5 w-3.5" />
            {attachmentLabel(att)} · ver no Discord
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}

function attachmentLabel(att: { content_type: string | null }[]): string {
  const kinds = { imagem: 0, vídeo: 0, áudio: 0, arquivo: 0 };
  for (const a of att) {
    const t = a.content_type || "";
    if (t.startsWith("image/")) kinds.imagem++;
    else if (t.startsWith("video/")) kinds.vídeo++;
    else if (t.startsWith("audio/")) kinds.áudio++;
    else kinds.arquivo++;
  }
  const plural: Record<string, string> = {
    imagem: "imagens",
    vídeo: "vídeos",
    áudio: "áudios",
    arquivo: "arquivos",
  };
  return Object.entries(kinds)
    .filter(([, n]) => n)
    .map(([k, n]) => `${n} ${n === 1 ? k : plural[k]}`)
    .join(" e ");
}

function areaLabel(c: CaseWithAnalysis): string {
  const a = caseArea(c, [], c.analyses?.waiting_for);
  return a ? AREA_NAME[a] : "sem área";
}

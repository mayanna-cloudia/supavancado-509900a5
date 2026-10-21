import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ExternalLink, Loader2, Maximize2, Minimize2, Paperclip } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { DateField, Empty, ErrorBox, Loading, PrioPill, StatusPill } from "@/components/sa/bits";
import { downloadCsv, toCsv } from "@/lib/csv";
import {
  loadCaseDetail,
  loadAuthorUsernames,
  loadClinicHistory,
  loadCasesPage,
  loadOpenBoard,
  PAGE_SIZE,
  useLoader,
  type CaseFilters,
  type ClinicHistoryRow,
} from "@/lib/data";
import { discordThreadUrl } from "@/lib/discord";
import { AREA_NAME, caseArea, fmtMinutes, fmtWhen, waitingInfo } from "@/lib/sla";
import type { CaseWithAnalysis, Message } from "@/lib/supabase";
import { lookupMember, isResolutive } from "@/lib/team";
import { useMounted } from "@/lib/prefs";
import { CaseRatingBox } from "@/components/sa/Ratings";
import { MessageText } from "@/components/sa/MessageText";

type Search = CaseFilters & {
  caso?: number;
  /** "cheio" = detalhe do caso em tela cheia */ ver?: "cheio";
};

/** Sem status na URL = só os abertos. */
const withDefaults = (s: Search): CaseFilters => ({ ...s, status: s.status ?? "abertos" });

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export const Route = createFileRoute("/casos")({
  head: () => ({ meta: [{ title: "Casos · Suporte Avançado" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: str(s.q),
    status: (["abertos", "todos", "resolvidos", "parados", "semretorno"] as const).find(
      (x) => x === s.status,
    ),
    prioridade: (["P1", "P2", "P3"] as const).find((x) => x === s.prioridade),
    area: (["N2", "Chatbot", "AM", "sem"] as const).find((x) => x === s.area),
    categoria: str(s.categoria),
    idclinic: str(s.idclinic) ?? (typeof s.idclinic === "number" ? String(s.idclinic) : undefined),
    problema: str(s.problema),
    pessoa: str(s.pessoa),
    de: str(s.de),
    ate: str(s.ate),
    pagina: Number(s.pagina) > 1 ? Number(s.pagina) : undefined,
    caso: Number(s.caso) > 0 ? Number(s.caso) : undefined,
    ver: s.ver === "cheio" ? "cheio" : undefined,
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
  // Tela cheia: esconde a lista e o detalhe ocupa a largura toda (?ver=cheio)
  const full = search.ver === "cheio" && !!selectedId;
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
            ["semretorno", "Fechados sem retorno"],
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
            ["sem", "Sem área"],
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
        {(
          [
            ["problema", "Problema"],
            ["categoria", "Categoria"],
            ["pessoa", "Pessoa"],
          ] as const
        ).map(([key, label]) =>
          search[key] ? (
            <button
              key={key}
              type="button"
              onClick={() => set({ [key]: undefined })}
              aria-label={`Tirar o filtro ${label}`}
              className="h-10 rounded-lg border border-brand bg-brand-soft px-3 text-[13px] text-brand-text"
            >
              {label}: {search[key]} ✕
            </button>
          ) : null,
        )}
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <section
          aria-label="Lista de casos"
          hidden={full}
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

        <aside
          aria-label="Detalhe do caso"
          className={[
            "card flex min-w-0 flex-col",
            // Ao lado da lista, o detalhe acompanha a rolagem e rola por dentro
            full
              ? "flex-[1_1_100%]"
              : "flex-[1_1_420px] lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto",
          ].join(" ")}
        >
          {selectedId ? (
            <CaseDetail
              id={selectedId}
              full={full}
              onToggleFull={() =>
                navigate({
                  search: (prev) => ({ ...prev, ver: full ? undefined : "cheio" }),
                  replace: true,
                })
              }
              onPick={(id) =>
                navigate({ search: (prev) => ({ ...prev, caso: id }), replace: true })
              }
            />
          ) : (
            <Empty>Escolha um caso na lista.</Empty>
          )}
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
      <StatusPill status={c.status} waitingClient={waitingClient} noResponse={c.no_response} />
    </button>
  );
}

function CaseDetail({
  id,
  full,
  onToggleFull,
  onPick,
}: {
  id: number;
  full: boolean;
  onToggleFull: () => void;
  onPick: (id: number) => void;
}) {
  const detail = useLoader(() => loadCaseDetail(id), [id], ["messages", "analyses"]);
  const idclinic = detail.data?.case.idclinic ?? null;
  const history = useLoader(
    () => (idclinic ? loadClinicHistory(idclinic, id) : Promise.resolve([] as ClinicHistoryRow[])),
    [idclinic, id],
  );
  // Menções <@123…> viram "@Nome": quem escreveu neste tópico ou, se não, em qualquer outro
  const mentioned = useMemo(() => {
    const ids = new Set<string>();
    for (const msg of detail.data?.messages ?? [])
      for (const m of (msg.content ?? "").matchAll(/<@!?(\d+)>/g)) ids.add(m[1]);
    return [...ids].sort();
  }, [detail.data]);
  const others = useLoader(() => loadAuthorUsernames(mentioned), [mentioned.join(",")]);
  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const [id, username] of others.data ?? []) m.set(id, lookupMember(username).name);
    for (const msg of detail.data?.messages ?? [])
      if (msg.author_id) m.set(msg.author_id, lookupMember(msg.author_username).name);
    return m;
  }, [detail.data, others.data]);
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
          <StatusPill
            status={c.status}
            waitingClient={a?.waiting_for === "client"}
            noResponse={c.no_response}
          />
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
        {c.status === "aberto" && a?.pending_username && (
          <div className="rounded-lg bg-hover px-3 py-2 text-[13.5px]">
            ⏳ <b>Aguardando: {lookupMember(a.pending_username).name}</b>
            {a.pending_reason ? `, ${a.pending_reason}` : ""}
          </div>
        )}
        {a?.resolution && (
          <div className="text-[13.5px]">
            <b>O que foi feito:</b> {a.resolution}
          </div>
        )}
        <CaseRatingBox caseId={c.id} />
        <div className="flex flex-wrap gap-2">
          <a
            href={discordThreadUrl(c)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-[38px] items-center gap-1.5 rounded-lg bg-[#3760ff] px-3.5 font-medium text-white no-underline hover:text-white"
          >
            <ExternalLink className="h-4 w-4" />
            Abrir no Discord
          </a>
          <button
            type="button"
            onClick={onToggleFull}
            className="inline-flex h-[38px] items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 font-medium text-foreground"
          >
            {full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {full ? "Voltar para a lista" : "Ver em tela cheia"}
          </button>
        </div>
      </div>
      <div className={full ? "flex flex-wrap items-start gap-x-6" : "flex flex-col"}>
        <div className="flex min-w-0 flex-[999_1_480px] flex-col gap-3.5 px-[18px] py-4">
          <div className="text-xs font-bold tracking-[0.06em] text-muted-foreground">
            CONVERSA · {messages.length} {messages.length === 1 ? "MENSAGEM" : "MENSAGENS"}
          </div>
          {messages.length === 0 && <Empty>Sem mensagens.</Empty>}
          {messages.map((m) => (
            <Bubble key={m.id} m={m} names={names} />
          ))}
        </div>
        {idclinic && (history.data?.length ?? 0) > 0 && (
          <section
            aria-label="Outros casos desta clínica"
            className={[
              "flex min-w-0 flex-col gap-1 px-[18px] py-4",
              full ? "flex-[1_1_300px]" : "border-t border-line",
            ].join(" ")}
          >
            <div className="text-xs font-bold tracking-[0.06em] text-muted-foreground">
              OUTROS CASOS DO IDCLINIC {idclinic}
            </div>
            {(history.data ?? []).map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => onPick(h.id)}
                className="flex w-full flex-wrap items-center gap-2 rounded-lg px-2 py-2 text-left text-foreground hover:bg-hover"
              >
                <PrioPill p={h.priority} />
                <span className="min-w-0 flex-[1_1_180px]">
                  <span className="block truncate text-[13.5px] font-medium">{h.thread_title}</span>
                  <span className="block text-[12px] text-muted-foreground">
                    {fmtWhen(h.opened_at)}
                    {h.analyses?.problem_label ? ` · ${h.analyses.problem_label}` : ""}
                  </span>
                </span>
                <StatusPill
                  status={h.status}
                  waitingClient={h.analyses?.waiting_for === "client"}
                  noResponse={h.no_response}
                />
              </button>
            ))}
            <Link
              to="/casos"
              search={{ idclinic, status: "todos" }}
              className="mt-1 px-2 text-[13px] font-bold"
            >
              Ver todos os casos desta clínica
            </Link>
          </section>
        )}
      </div>
    </>
  );
}

function Bubble({ m, names }: { m: Message; names: Map<string, string> }) {
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
            className={`max-w-full self-start rounded-[4px_12px_12px_12px] px-3 py-2 [overflow-wrap:anywhere] ${ours ? "bg-brand-soft" : "bg-hover"}`}
          >
            <MessageText text={m.content} names={names} />
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

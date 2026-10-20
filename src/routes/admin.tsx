import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  Sparkles,
  Download,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/shell/AppShell";
import { clearSession, RequireAccess, sessionToken } from "@/components/shell/RequireAccess";
import { Markdown } from "@/components/sa/Markdown";
import { Empty, ErrorBox, Loading, Pill, PrioPill } from "@/components/sa/bits";
import { downloadCsv, toCsv } from "@/lib/csv";
import {
  loadBotHealth,
  loadFeedbacks,
  loadOpenCaseIds,
  loadUnanalyzedCaseIds,
  loadValidationQueue,
  loadWeeklySummaries,
  useLoader,
} from "@/lib/data";
import { discordThreadUrl } from "@/lib/discord";
import {
  generateWeekly,
  loadPanelFeedback,
  loadRatings,
  saveFeedback,
} from "@/lib/actions.functions";
import { RatingsList, RatingSummary } from "@/components/sa/Ratings";
import { startJob, useJob } from "@/lib/jobs";
import {
  brtMonthStart,
  brtParts,
  brtWeekStart,
  fmtDay,
  fmtMinutes,
  fmtWhen,
  isoWeekKey,
} from "@/lib/sla";
import type { CaseWithAnalysis } from "@/lib/supabase";
import { useMounted, useWho } from "@/lib/prefs";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin · Suporte Avançado" }] }),
  component: () => (
    <AppShell>
      <RequireAccess role="admin" title="Admin">
        <Admin />
      </RequireAccess>
    </AppShell>
  ),
});

type Tab = "validar" | "boletim" | "avaliacoes" | "feedback" | "ferramentas" | "historico";

function Admin() {
  const mounted = useMounted();
  const [tab, setTab] = useState<Tab>("validar");
  const queue = useLoader(loadValidationQueue, [], ["analyses"]);
  const tabs: [Tab, string, number?][] = [
    ["validar", "Validar análises", queue.data?.length],
    ["boletim", "Boletim da semana"],
    ["avaliacoes", "Avaliações"],
    ["feedback", "Feedback do painel"],
    ["ferramentas", "Ferramentas"],
    ["historico", "Histórico de validações"],
  ];
  if (!mounted) return <Loading />;
  return (
    <>
      <div
        role="tablist"
        aria-label="Seções do admin"
        className="-mt-2 flex overflow-x-auto border-b border-line"
      >
        {tabs.map(([key, label, n]) => {
          const on = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(key)}
              className={[
                "flex min-h-[52px] shrink-0 items-center gap-2 px-4",
                on
                  ? "font-bold text-brand-text shadow-[inset_0_-2px_0_var(--brand)]"
                  : "font-medium text-muted-foreground",
              ].join(" ")}
            >
              {label}
              {n != null && n > 0 && (
                <span className="min-w-[22px] rounded-full bg-[#3760ff] px-1.5 py-px text-[11px] font-bold text-white">
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {tab === "validar" && <Validate queue={queue} />}
      {tab === "boletim" && <Weekly />}
      {tab === "ferramentas" && <Tools onHistory={() => setTab("historico")} />}
      {tab === "avaliacoes" && <AdminRatings />}
      {tab === "feedback" && <PanelFeedbackTab />}
      {tab === "historico" && <History />}
    </>
  );
}

// ─── Validar análises ────────────────────────────────────────────────────────

const REASONS = [
  "Resolvedor errado",
  "Resumo genérico demais",
  "Categoria errada",
  "Problema errado",
  "Com quem está a bola errado",
  "Outro",
];

function Validate({ queue }: { queue: ReturnType<typeof useLoader<CaseWithAnalysis[]>> }) {
  const { person } = useWho();
  const [done, setDone] = useState<Set<number>>(new Set());
  const [selId, setSelId] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const items = useMemo(
    () => (queue.data ?? []).filter((c) => !done.has(c.id)),
    [queue.data, done],
  );
  const cur = items.find((c) => c.id === selId) ?? items[0];

  const submit = useCallback(
    async (rating: "aprovado" | "corrigido") => {
      if (!cur || busy) return;
      if (rating === "corrigido" && !reason) {
        toast.error("Escolha o motivo da correção.");
        return;
      }
      setBusy(true);
      const res = await saveFeedback({
        data: {
          token: sessionToken(),
          caseId: cur.id,
          rating,
          reason: rating === "corrigido" ? reason : undefined,
          comment,
          reviewer: person?.name ?? "Admin",
        },
      });
      setBusy(false);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(rating === "aprovado" ? "Análise aprovada" : "Correção registrada");
      setDone((d) => new Set(d).add(cur.id));
      setSelId(null);
      setComment("");
      setReason("");
    },
    [cur, busy, reason, comment, person],
  );

  // Atalhos: A aprova, R corrige (fora de campos de texto)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.tagName === "SELECT") return;
      if (e.key === "a" || e.key === "A") submit("aprovado");
      if (e.key === "r" || e.key === "R") document.getElementById("motivo")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submit]);

  if (queue.loading && !queue.data) return <Loading />;
  if (queue.error) return <ErrorBox message={queue.error} />;
  if (!cur) return <Empty>Nenhuma análise esperando validação.</Empty>;
  const a = cur.analyses!;

  return (
    <div className="flex flex-wrap items-start gap-4">
      <section
        aria-label="Fila de validação"
        className="card min-w-0 flex-[1_1_300px] overflow-hidden"
      >
        <div className="border-b border-line px-4 py-3 text-[12.5px] text-muted-foreground">
          {items.length} análises esperando validação
        </div>
        <div className="max-h-[640px] overflow-y-auto">
          {items.slice(0, 100).map((c) => {
            const on = c.id === cur.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => setSelId(c.id)}
                className={[
                  "flex w-full flex-col gap-0.5 border-b border-line px-4 py-3 text-left text-foreground",
                  on ? "bg-brand-soft shadow-[inset_3px_0_0_var(--brand)]" : "",
                ].join(" ")}
              >
                <span className="font-medium">{c.thread_title}</span>
                <span className="text-[12.5px] text-muted-foreground">
                  IDCLINIC {c.idclinic ?? "?"} · {fmtWhen(c.last_activity_at)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section
        aria-labelledby="val-t"
        className="card flex min-w-0 flex-[999_1_520px] flex-col gap-3.5 px-5 py-[18px]"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="val-t" className="m-0 text-lg font-bold">
              {cur.thread_title}
            </h2>
            <div className="text-[12.5px] text-muted-foreground">
              IDCLINIC {cur.idclinic ?? "?"} · analisado {fmtWhen(a.analyzed_at)} ·{" "}
              {a.model ?? "modelo antigo"}
            </div>
          </div>
          <a
            href={discordThreadUrl(cur)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium"
          >
            Abrir no Discord <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
          {[
            ["Categoria", a.category],
            ["Módulo", a.subcategory],
            ["Problema", a.problem_label],
            ["Resolvido por", a.resolver_name],
            [
              "Com quem está a bola",
              a.waiting_for === "client"
                ? "Clínica"
                : a.waiting_for === "none"
                  ? "Ninguém"
                  : a.waiting_for
                    ? "Time"
                    : null,
            ],
            [
              "1ª resposta",
              a.first_response_minutes != null ? fmtMinutes(a.first_response_minutes) : null,
            ],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-hover px-3 py-2.5">
              <div className="text-xs text-muted-foreground">{k}</div>
              <div className="font-medium">{v || "—"}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <PrioPill p={cur.priority} long />{" "}
          {cur.person_tags.map((t) => (
            <span key={t} className="rounded-full bg-hover px-2 py-0.5 text-xs">
              {t}
            </span>
          ))}
        </div>
        <div>
          <div className="text-xs font-bold tracking-[0.06em] text-muted-foreground">PROBLEMA</div>
          <div className="mt-1">{a.summary || "—"}</div>
        </div>
        <div>
          <div className="text-xs font-bold tracking-[0.06em] text-muted-foreground">RESOLUÇÃO</div>
          <div className="mt-1">{a.resolution || "Ainda não resolvido."}</div>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-[0_1_260px] flex-col gap-1.5">
            <label htmlFor="motivo" className="text-[13px] text-muted-foreground">
              Motivo (para corrigir)
            </label>
            <select
              id="motivo"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-10 rounded-lg border border-border bg-card px-2.5 text-foreground"
            >
              <option value="">Escolha…</option>
              {REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-[1_1_300px] flex-col gap-1.5">
            <label htmlFor="coment" className="text-[13px] text-muted-foreground">
              Comentário (opcional, vira exemplo para melhorar a IA)
            </label>
            <textarea
              id="coment"
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Ex.: quem resolveu foi o Chatbot, não o N2"
              className="resize-y rounded-lg border border-border bg-card px-3 py-2.5 text-foreground"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => submit("aprovado")}
            className="flex h-[42px] items-center gap-2 rounded-lg bg-[#1e8a5a] px-[18px] font-medium text-white disabled:opacity-60"
          >
            Aprovar{" "}
            <kbd className="rounded border border-current px-1.5 text-[11px] font-bold">A</kbd>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => submit("corrigido")}
            className="flex h-[42px] items-center gap-2 rounded-lg border border-red px-[18px] font-medium text-red disabled:opacity-60"
          >
            Corrigir{" "}
            <kbd className="rounded border border-current px-1.5 text-[11px] font-bold">R</kbd>
          </button>
          {busy && <Loader2 className="h-5 w-5 animate-spin self-center" />}
        </div>
      </section>
    </div>
  );
}

// ─── Boletim da semana ───────────────────────────────────────────────────────

function Weekly() {
  const summaries = useLoader(loadWeeklySummaries, []);
  const weeks = useMemo(() => {
    const thisMonday = brtWeekStart(new Date());
    return Array.from({ length: 8 }, (_, i) => {
      const start = new Date(thisMonday.getTime() - (i + 1) * 7 * 86_400_000);
      const end = new Date(start.getTime() + 6 * 86_400_000);
      return { start, key: isoWeekKey(start), label: `${fmtDay(start)} a ${fmtDay(end)}` };
    });
  }, []);
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState(false);
  const week = weeks[sel];
  const saved = summaries.data?.find((s) => s.week_key === week.key);

  const generate = async () => {
    setBusy(true);
    const res = await generateWeekly({
      data: { token: sessionToken(), weekStart: week.start.toISOString() },
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success("Boletim gerado e salvo para o time");
    summaries.reload();
  };

  const copy = async () => {
    if (!saved) return;
    await navigator.clipboard.writeText(saved.content.text);
    toast.success("Boletim copiado. É só colar no Discord.");
  };

  return (
    <div className="flex flex-wrap items-start gap-4">
      <nav aria-label="Semanas" className="card min-w-0 flex-[1_1_220px] overflow-hidden">
        <div className="border-b border-line px-4 py-3 font-bold">Semanas</div>
        {weeks.map((w, i) => {
          const has = summaries.data?.some((s) => s.week_key === w.key);
          const on = i === sel;
          return (
            <button
              key={w.key}
              type="button"
              aria-pressed={on}
              onClick={() => setSel(i)}
              className={[
                "flex w-full flex-col gap-0.5 border-b border-line px-4 py-3 text-left text-foreground",
                on ? "bg-brand-soft shadow-[inset_3px_0_0_var(--brand)]" : "",
              ].join(" ")}
            >
              <span className="font-medium">{w.label}</span>
              <span className="text-xs text-muted-foreground">
                {has ? "boletim salvo" : "ainda não gerado"}
              </span>
            </button>
          );
        })}
      </nav>

      <article className="card min-w-0 flex-[999_1_560px] overflow-hidden">
        <div className="bg-grad-brand flex flex-wrap items-center justify-between gap-3 px-[22px] py-[18px] text-white">
          <div>
            <div className="text-[12.5px] opacity-90">Boletim do Suporte Avançado</div>
            <h2 className="m-0 mt-0.5 text-xl font-bold">Semana de {week.label}</h2>
            {saved && (
              <div className="text-[12.5px] opacity-90">
                {saved.content.total} casos resolvidos · gerado {fmtWhen(saved.generated_at)}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={generate}
              disabled={busy}
              className="flex h-[38px] items-center gap-2 rounded-lg border border-white/60 px-3.5 text-white disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {saved ? "Gerar de novo" : "Gerar boletim"}
            </button>
            {saved && (
              <button
                type="button"
                onClick={copy}
                className="flex h-[38px] items-center gap-2 rounded-lg bg-white px-3.5 font-bold text-[#2c4edc]"
              >
                <Copy className="h-4 w-4" /> Copiar para o Discord
              </button>
            )}
          </div>
        </div>
        <div className="px-[22px] py-5">
          {summaries.loading && !summaries.data ? (
            <Loading />
          ) : saved ? (
            <>
              <Markdown text={saved.content.text} />
              <div
                className={`mt-4 border-t border-line pt-3 text-[12.5px] ${saved.content.text.length > 2000 ? "text-red" : "text-muted-foreground"}`}
              >
                {saved.content.text.length.toLocaleString("pt-BR")} caracteres ·{" "}
                {saved.content.text.length > 2000
                  ? "passa do limite de uma mensagem do Discord (2.000). Gere de novo."
                  : "cabe numa mensagem do Discord."}
              </div>
            </>
          ) : (
            <Empty>
              {busy
                ? "A IA está escrevendo o boletim, leva cerca de um minuto…"
                : "Ainda não tem boletim desta semana. Clique em “Gerar boletim”: a IA lê os casos resolvidos e escreve um resumo curto, que cabe numa mensagem do Discord."}
            </Empty>
          )}
        </div>
      </article>
    </div>
  );
}

// ─── Ferramentas ─────────────────────────────────────────────────────────────

function ToolCard({
  icon: Icon,
  title,
  desc,
  status,
  children,
}: {
  icon: typeof Activity;
  title: string;
  desc: string;
  status?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="card flex flex-col gap-2.5 px-5 py-[18px]">
      <div className="flex items-center gap-3">
        <div className="bg-grad-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-white">
          <Icon className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <h2 className="m-0 text-base font-bold">{title}</h2>
      </div>
      <div>{desc}</div>
      {status && <div className="text-[12.5px] text-muted-foreground">{status}</div>}
      {children}
    </section>
  );
}

const btnPrimary =
  "flex h-10 items-center gap-2 self-start rounded-lg bg-[#3760ff] px-3.5 font-medium text-white disabled:opacity-60";
const btnSecondary =
  "flex h-10 items-center gap-2 self-start rounded-lg border border-border bg-card px-3.5 font-medium text-foreground disabled:opacity-60";

function Tools({ onHistory }: { onHistory: () => void }) {
  const pending = useLoader(() => loadUnanalyzedCaseIds(), [], ["analyses"]);
  const open = useLoader(loadOpenCaseIds, [], ["cases"]);
  const health = useLoader(loadBotHealth, [], ["messages"]);
  const feedbacks = useLoader(loadFeedbacks, []);
  const job = useJob();
  const { person } = useWho();
  const busy = job?.status === "running";
  const start = (label: string, ids: number[] | null) => {
    if (!ids?.length) {
      toast.info("Nada para analisar.");
      return;
    }
    if (!startJob(label, ids, person?.name ?? "Admin"))
      toast.error("Já tem uma análise rodando. Espere terminar ou cancele.");
  };

  const reasons = new Map<string, number>();
  for (const f of feedbacks.data ?? [])
    if (f.rating === "corrigido" && f.reason)
      reasons.set(f.reason, (reasons.get(f.reason) ?? 0) + 1);
  const topReasons = [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);

  return (
    <>
      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))]">
        <ToolCard
          icon={Sparkles}
          title="Analisar pendentes"
          desc="Roda a IA nos casos que ainda não têm análise, um por vez, com 1 segundo de pausa entre eles. O andamento aparece no topo de todas as telas."
          status={pending.data ? `${pending.data.length} casos sem análise agora` : "contando…"}
        >
          <button
            type="button"
            className={btnPrimary}
            disabled={!pending.data?.length || busy}
            onClick={() => start("Analisando casos pendentes com a IA", pending.data)}
          >
            Analisar {pending.data?.length ?? ""} casos
          </button>
        </ToolCard>
        <ToolCard
          icon={RefreshCw}
          title="Reanalisar casos em aberto"
          desc="Refaz a análise de todos os casos abertos. Use depois de mudar o prompt ou o modelo da IA."
          status={open.data ? `${open.data.length} casos abertos` : "contando…"}
        >
          <button
            type="button"
            className={btnSecondary}
            disabled={!open.data?.length || busy}
            onClick={() => start("Reanalisando casos em aberto com a IA", open.data)}
          >
            Reanalisar {open.data?.length ?? ""} casos
          </button>
        </ToolCard>
        <ToolCard
          icon={Activity}
          title="Saúde do bot"
          desc="Mostra se o bot do Discord está gravando. Tópico apagado no Discord sai dos números na hora."
          status={
            health.data
              ? `${health.data.threads} tópicos no banco · última mensagem ${health.data.lastMessageAt ? fmtWhen(health.data.lastMessageAt) : "—"} · último tópico atualizado ${health.data.lastSyncAt ? fmtWhen(health.data.lastSyncAt) : "—"}`
              : "verificando…"
          }
        />
        <ToolCard
          icon={Download}
          title="Reimportar histórico"
          desc="Para ler de novo todos os tópicos do Discord desde 1º de janeiro, reinicie o bot na Discloud. Ele confere cada tópico e só grava o que faltar."
          status="Use se o bot ficou muito tempo fora do ar."
        />
        <ToolCard
          icon={CheckCircle2}
          title="Histórico de validações"
          desc="Todas as análises aprovadas e corrigidas, com os motivos. Os motivos mais comuns mostram onde ajustar o prompt."
          status={
            topReasons.length
              ? `mais comum: ${topReasons.map(([r, n]) => `${r.toLowerCase()} (${n})`).join(" · ")}`
              : "nenhuma correção ainda"
          }
        >
          <button type="button" className={btnSecondary} onClick={onHistory}>
            Abrir histórico
          </button>
        </ToolCard>
        <ToolCard
          icon={KeyRound}
          title="Acesso e senhas"
          desc="As senhas da área Admin e da Coordenação ficam nos secrets do projeto (ADMIN_PASSWORD e COORD_PASSWORD). Trocou lá, vale no próximo acesso. As telas do time continuam abertas."
        >
          <button
            type="button"
            className={btnSecondary}
            onClick={() => {
              clearSession();
              location.reload();
            }}
          >
            Sair desta sessão
          </button>
        </ToolCard>
      </div>
    </>
  );
}

// ─── Histórico de validações ────────────────────────────────────────────────

function History() {
  const data = useLoader(loadFeedbacks, []);
  const [filter, setFilter] = useState<"" | "aprovado" | "corrigido">("");
  if (data.loading && !data.data) return <Loading />;
  if (data.error) return <ErrorBox message={data.error} />;
  const rows = (data.data ?? []).filter((f) => !filter || f.rating === filter);

  const exportCsv = () =>
    downloadCsv(
      "validacoes-suporte-avancado.csv",
      toCsv(
        ["Data", "Caso", "Título", "IDCLINIC", "Avaliação", "Motivo", "Comentário", "Quem validou"],
        rows.map((f) => [
          fmtWhen(f.created_at),
          f.case_id,
          f.cases?.thread_title,
          f.cases?.idclinic,
          f.rating,
          f.reason,
          f.comment,
          f.reviewer,
        ]),
      ),
    );

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-[18px] py-3">
        <div className="flex gap-1">
          {(["", "aprovado", "corrigido"] as const).map((f) => (
            <button
              key={f || "todos"}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={[
                "h-9 rounded-lg border px-3 text-[13px]",
                filter === f
                  ? "border-brand bg-brand-soft font-bold text-brand-text"
                  : "border-border bg-card",
              ].join(" ")}
            >
              {f === "" ? "Todas" : f === "aprovado" ? "Aprovadas" : "Corrigidas"}
            </button>
          ))}
        </div>
        <button type="button" onClick={exportCsv} className={btnSecondary}>
          Exportar CSV
        </button>
      </div>
      {rows.length === 0 && <Empty>Nenhuma validação registrada ainda.</Empty>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <tbody>
            {rows.map((f) => (
              <tr key={f.id} className="border-b border-line align-top">
                <td className="whitespace-nowrap px-[18px] py-3 text-[13px] text-muted-foreground">
                  {fmtWhen(f.created_at)}
                </td>
                <td className="px-2 py-3">
                  <div className="font-medium">{f.cases?.thread_title ?? `Caso ${f.case_id}`}</div>
                  {(f.reason || f.comment) && (
                    <div className="text-[13px] text-muted-foreground">
                      {[f.reason, f.comment].filter(Boolean).join(" — ")}
                    </div>
                  )}
                </td>
                <td className="px-2 py-3">
                  <Pill tone={f.rating === "aprovado" ? "green" : "red"}>
                    {f.rating === "aprovado" ? "Aprovada" : "Corrigida"}
                  </Pill>
                </td>
                <td className="px-[18px] py-3 text-[13px] text-muted-foreground">{f.reviewer}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Avaliações do atendimento ──────────────────────────────────────────────

type RatingPeriod = "mes" | "anterior" | "90";

function AdminRatings() {
  const [period, setPeriod] = useState<RatingPeriod>("mes");
  const [team, setTeam] = useState("");
  const data = useLoader(async () => {
    const now = new Date();
    const p = brtParts(now);
    const prev = p.month === 1 ? { y: p.year - 1, m: 12 } : { y: p.year, m: p.month - 1 };
    const range =
      period === "mes"
        ? [brtMonthStart(p.year, p.month), new Date(now.getTime() + 86_400_000)]
        : period === "anterior"
          ? [brtMonthStart(prev.y, prev.m), brtMonthStart(p.year, p.month)]
          : [new Date(now.getTime() - 90 * 86_400_000), new Date(now.getTime() + 86_400_000)];
    const res = await loadRatings({
      data: { token: sessionToken(), from: range[0].toISOString(), to: range[1].toISOString() },
    });
    if (!res.ok) throw new Error(res.message);
    return res.rows;
  }, [period]);

  const rows = (data.data ?? []).filter((r) => !team || r.resolver_team === team);
  const exportCsv = () =>
    downloadCsv(
      "avaliacoes-atendimento.csv",
      toCsv(
        [
          "Enviada em",
          "Respondida em",
          "Caso",
          "Título",
          "Resolvedor",
          "Área",
          "Avaliado por",
          "Nota",
          "Comentário",
          "Situação",
        ],
        rows.map((r) => [
          fmtWhen(r.sent_at),
          r.answered_at ? fmtWhen(r.answered_at) : "",
          r.case_id,
          r.cases?.thread_title,
          r.resolver_name,
          r.resolver_team,
          r.rater_name,
          r.score,
          r.comment,
          r.score != null
            ? "respondida"
            : r.status === "falhou"
              ? "mensagem bloqueada"
              : new Date(r.expires_at) < new Date()
                ? "prazo encerrado"
                : "aguardando",
        ]),
      ),
    );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Período" className="flex flex-wrap gap-1">
          {(
            [
              ["mes", "Este mês"],
              ["anterior", "Mês passado"],
              ["90", "90 dias"],
            ] as [RatingPeriod, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={period === k}
              onClick={() => setPeriod(k)}
              className={[
                "h-9 rounded-lg border px-3 text-[13px]",
                period === k
                  ? "border-brand bg-brand-soft font-bold text-brand-text"
                  : "border-border bg-card",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="aval-area" className="text-[13px] text-muted-foreground">
            Área
          </label>
          <select
            id="aval-area"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            className="h-9 rounded-lg border border-border bg-card px-2.5 text-foreground"
          >
            <option value="">Todas</option>
            <option value="Suporte N2">Suporte N2</option>
            <option value="Chatbot">Chatbot</option>
            <option value="AM">Área de Membros</option>
          </select>
          <button type="button" onClick={exportCsv} className={btnSecondary}>
            Exportar CSV
          </button>
        </div>
      </div>
      {data.error && <ErrorBox message={data.error} />}
      {data.loading && !data.data ? (
        <Loading />
      ) : (
        <>
          <section aria-labelledby="aval-resumo" className="card overflow-hidden">
            <div className="border-b border-line px-[18px] py-3.5">
              <h2 id="aval-resumo" className="m-0 text-base font-bold">
                Média por pessoa
              </h2>
              <div className="text-[12.5px] text-muted-foreground">
                Quem abriu o tópico recebe a avaliação no Discord quando ele fecha e tem 2 dias para
                responder.
              </div>
            </div>
            <RatingSummary rows={rows} />
          </section>
          <section aria-labelledby="aval-lista" className="card overflow-hidden">
            <div className="border-b border-line px-[18px] py-3.5">
              <h2 id="aval-lista" className="m-0 text-base font-bold">
                Todas as avaliações
              </h2>
            </div>
            <RatingsList rows={rows} />
          </section>
        </>
      )}
    </>
  );
}

// ─── Feedback do painel (rota /feedbacksupavancado) ─────────────────────────

function PanelFeedbackTab() {
  const data = useLoader(async () => {
    const res = await loadPanelFeedback({ data: { token: sessionToken() } });
    if (!res.ok) throw new Error(res.message);
    return res.rows;
  }, []);
  const rows = data.data ?? [];
  const avg = rows.length ? rows.reduce((a, r) => a + r.score, 0) / rows.length : null;
  const screens = new Map<string, number>();
  for (const r of rows) if (r.screen) screens.set(r.screen, (screens.get(r.screen) ?? 0) + 1);
  const link = "https://supavancado.lovable.app/feedbacksupavancado";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não consegui copiar. Selecione o link e copie.");
    }
  };
  const exportCsv = () =>
    downloadCsv(
      "feedback-painel.csv",
      toCsv(
        [
          "Enviado em",
          "Nome",
          "E-mail",
          "Nota",
          "Tela que mais usa",
          "O que ficou bom",
          "O que falta ou atrapalha",
        ],
        rows.map((r) => [
          fmtWhen(r.created_at),
          r.name,
          r.email,
          r.score,
          r.screen,
          r.good,
          r.improve,
        ]),
      ),
    );

  return (
    <>
      <section className="card flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <div className="font-bold">Link para o time</div>
          <div className="break-all text-[13px] text-muted-foreground">{link}</div>
          <div className="text-[12.5px] text-muted-foreground">
            Fora do menu e dos buscadores. Uma resposta por e-mail.
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={copyLink} className={btnSecondary}>
            Copiar link
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className={btnSecondary}
            disabled={!rows.length}
          >
            Exportar CSV
          </button>
        </div>
      </section>
      {data.error && <ErrorBox message={data.error} />}
      {data.loading && !data.data ? (
        <Loading />
      ) : (
        <section aria-labelledby="fbp-t" className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-[18px] py-3.5">
            <h2 id="fbp-t" className="m-0 mr-2 text-base font-bold">
              Respostas do time
            </h2>
            <Pill tone="brand">
              {rows.length} resposta{rows.length === 1 ? "" : "s"}
            </Pill>
            {avg != null && <Pill tone="brand">nota média {avg.toFixed(1).replace(".", ",")}</Pill>}
            {[...screens.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([k, n]) => (
                <Pill key={k} tone="gray">
                  {k}: {n}
                </Pill>
              ))}
          </div>
          {rows.length === 0 && (
            <Empty>Ninguém respondeu ainda. Mande o link acima para o time.</Empty>
          )}
          {rows.map((r) => (
            <div key={r.id} className="flex flex-col gap-1 border-b border-line px-[18px] py-3">
              <div className="flex flex-wrap items-center gap-2">
                <b>{r.name}</b>
                <span className="text-[12.5px] text-muted-foreground">{r.email}</span>
                <Pill tone={r.score >= 4 ? "green" : r.score === 3 ? "yellow" : "red"}>
                  nota {r.score}
                </Pill>
                {r.screen && (
                  <span className="text-[12.5px] text-muted-foreground">mais usa: {r.screen}</span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {fmtWhen(r.created_at)}
                </span>
              </div>
              {r.good && (
                <div className="text-[13.5px]">
                  <b>Ficou bom:</b> {r.good}
                </div>
              )}
              {r.improve && (
                <div className="text-[13.5px]">
                  <b>Falta ou atrapalha:</b> {r.improve}
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </>
  );
}

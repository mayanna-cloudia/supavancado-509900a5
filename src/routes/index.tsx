import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell, TopSearch } from "@/components/shell/AppShell";
import {
  DiscordIconLink,
  Empty,
  ErrorBox,
  FlagBar,
  Loading,
  PageTitle,
  PrioPill,
  SeeMore,
  SlaBar,
} from "@/components/sa/bits";
import {
  loadCasesClosedBetween,
  loadCasesOpenedBetween,
  loadOpenBoard,
  useLoader,
  type LightCase,
} from "@/lib/data";
import { discordThreadUrl } from "@/lib/discord";
import { useMounted, useWho } from "@/lib/prefs";
import {
  AREA_NAME,
  brtMonthStart,
  brtParts,
  brtWeekStart,
  caseArea,
  firstResponseWithinSla,
  fmtWaiting,
  waitingInfo,
  type Area,
} from "@/lib/sla";
import type { Message } from "@/lib/supabase";
import { groupBy, mostCommon } from "@/lib/group";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Hoje · Suporte Avançado" }] }),
  component: TodayPage,
});

type Tab = "todos" | "meus" | Area | "clinica";
const DAY = 86_400_000;

function TodayPage() {
  return (
    <AppShell actions={<TopSearch />}>
      <Today />
    </AppShell>
  );
}

function Today() {
  const mounted = useMounted();
  const { person } = useWho();
  const [tab, setTab] = useState<Tab>("todos");
  const board = useLoader(loadOpenBoard, [], ["cases", "analyses", "messages"]);
  const recent = useLoader(
    async () => {
      const now = new Date();
      const p = brtParts(now);
      const monthStart = brtMonthStart(p.year, p.month);
      const from30 = new Date(now.getTime() - 30 * DAY);
      const openedFrom = monthStart < from30 ? monthStart : from30;
      const weekStart = brtWeekStart(now);
      const [opened, closed] = await Promise.all([
        loadCasesOpenedBetween(openedFrom, new Date(now.getTime() + DAY)),
        loadCasesClosedBetween(
          new Date(weekStart.getTime() - 7 * DAY),
          new Date(now.getTime() + DAY),
        ),
      ]);
      return { opened, closed, monthStart, from30, weekStart };
    },
    [],
    ["cases"],
  );

  const queue = useMemo(() => {
    if (!board.data) return [];
    const now = new Date();
    return board.data.cases.map((c) => {
      const msgs = (board.data!.messagesByCase.get(c.id) ?? []) as Message[];
      return { c, w: waitingInfo(c, msgs, c.analyses?.waiting_for, now) };
    });
  }, [board.data]);

  if (!mounted || (board.loading && !board.data)) return <Loading label="Carregando a fila…" />;
  if (board.error && !board.data) return <ErrorBox message={board.error} />;

  const team = queue.filter((x) => x.w.on === "team").sort((a, b) => b.w.usedPct - a.w.usedPct);
  const client = queue.filter((x) => x.w.on === "client");
  const late = team.filter((x) => x.w.usedPct >= 100);
  const stuck = team.filter((x) => x.w.businessDays >= 2);
  const mine = person?.tag ? team.filter((x) => x.c.person_tags.includes(person.tag!)) : [];
  const noOwner = team.filter((x) => x.c.person_tags.length === 0).length;
  const lateBy = (["n2", "am", "chatbot"] as Area[])
    .map((a) => [a, late.filter((x) => x.w.area === a).length] as const)
    .filter(([, n]) => n);

  const rows =
    tab === "todos"
      ? team
      : tab === "meus"
        ? mine
        : tab === "clinica"
          ? client
          : team.filter((x) => x.w.area === tab);
  const tabs: { key: Tab; label: string; n: number }[] = [
    { key: "todos", label: "Todos", n: team.length },
    ...(person?.tag ? [{ key: "meus" as Tab, label: "Com a minha tag", n: mine.length }] : []),
    { key: "n2", label: "N2", n: team.filter((x) => x.w.area === "n2").length },
    { key: "chatbot", label: "Chatbot", n: team.filter((x) => x.w.area === "chatbot").length },
    { key: "am", label: "AM", n: team.filter((x) => x.w.area === "am").length },
    { key: "clinica", label: "Esperando clínica", n: client.length },
  ];

  return (
    <>
      {stuck.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-[10px] bg-orange-bg px-4 py-3 text-orange">
          <AlertTriangle className="h-5 w-5" />
          <span className="flex-[1_1_260px] font-medium">
            {stuck.length === 1 ? "1 caso parado" : `${stuck.length} casos parados`} há mais de 2
            dias úteis sem resposta do time
          </span>
          <Link
            to="/casos"
            search={{ status: "parados" }}
            className="inline-flex h-9 items-center rounded-lg bg-card px-3.5 font-bold text-orange no-underline hover:text-orange"
          >
            Ver casos parados
          </Link>
        </div>
      )}

      <PageTitle title="Hoje" subtitle="Casos esperando alguém do time agora." />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
        <Kpi
          className="bg-grad-brand text-white"
          value={team.length}
          label="Esperando o time"
          hint={noOwner ? `${noOwner} sem responsável` : "todos com responsável"}
        />
        <Kpi
          className="bg-grad-red text-white"
          value={late.length}
          label="Fora do SLA agora"
          hint={
            lateBy.length
              ? lateBy
                  .map(([a, n]) => `${a === "n2" ? "N2" : a === "am" ? "AM" : "Chatbot"} ${n}`)
                  .join(" · ")
              : "nenhum atrasado"
          }
        />
        <Kpi
          className="bg-grad-yellow text-[#3d2e00]"
          value={client.length}
          label="Esperando a clínica"
          hint="não conta no SLA"
        />
        <ResolvedKpi recent={recent.data} />
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <section aria-label="Fila" className="card min-w-0 flex-[999_1_560px] overflow-hidden">
          <div
            role="tablist"
            aria-label="Filtrar fila"
            className="flex overflow-x-auto border-b border-line px-2"
          >
            {tabs.map((t) => {
              const on = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTab(t.key)}
                  className={[
                    "flex min-h-12 shrink-0 items-center gap-2 px-3.5",
                    on
                      ? "font-bold text-brand-text shadow-[inset_0_-2px_0_var(--brand)]"
                      : "font-medium text-muted-foreground",
                  ].join(" ")}
                >
                  {t.label}
                  <span
                    className={`min-w-[22px] rounded-full px-1.5 py-px text-[11px] font-bold text-white ${t.key === "clinica" ? "bg-[#6b7280]" : "bg-[#3760ff]"}`}
                  >
                    {t.n}
                  </span>
                </button>
              );
            })}
          </div>
          {rows.length === 0 && (
            <Empty>
              {tab === "meus"
                ? "Nenhum caso com a sua tag esperando agora."
                : "Nenhum caso aqui agora."}
            </Empty>
          )}
          {rows.map(({ c, w }) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-line px-[18px] py-3.5"
            >
              <PrioPill p={c.priority} long />
              <Link
                to="/casos"
                search={{ caso: c.id }}
                className="min-w-0 flex-[1_1_240px] text-foreground no-underline hover:text-foreground"
              >
                <div className="text-[15px] font-medium">{c.thread_title}</div>
                <div className="text-[12.5px] text-muted-foreground">
                  {c.idclinic ? `IDCLINIC ${c.idclinic}` : "sem IDCLINIC"} ·{" "}
                  {w.area ? AREA_NAME[w.area] : "sem área"} ·{" "}
                  {c.person_tags.length ? c.person_tags.join(", ") : "sem responsável"}
                </div>
              </Link>
              <div className="flex flex-[0_1_180px] flex-col gap-1">
                <div className="flex justify-between text-[12.5px]">
                  <span
                    className={`font-bold ${w.usedPct >= 100 ? "text-red" : w.usedPct >= 75 ? "text-orange" : ""}`}
                  >
                    {fmtWaiting(w)}
                  </span>
                  <span className="text-muted-foreground">
                    {w.on === "client" ? "pausado" : `SLA ${w.slaLabel}`}
                  </span>
                </div>
                {w.on === "team" && (
                  <SlaBar
                    pct={w.usedPct}
                    label={w.usedPct >= 100 ? "Fora do SLA" : `${w.usedPct}% do SLA usado`}
                  />
                )}
              </div>
              <DiscordIconLink href={discordThreadUrl(c)} />
            </div>
          ))}
        </section>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <SidePanels recent={recent.data} openCases={board.data?.cases ?? []} />
        </aside>
      </div>
    </>
  );
}

function Kpi({
  value,
  label,
  hint,
  className,
}: {
  value: number | string;
  label: string;
  hint: string;
  className: string;
}) {
  return (
    <div
      className={`flex flex-col gap-0.5 rounded-xl px-[18px] py-4 shadow-[0_2px_8px_rgba(0,0,0,0.08)] ${className}`}
    >
      <div className="text-[13px] font-medium">{label}</div>
      <div className="text-[34px] font-bold leading-tight tabular-nums">{value}</div>
      <div className="text-[12.5px]">{hint}</div>
    </div>
  );
}

type Recent = {
  opened: LightCase[];
  closed: LightCase[];
  monthStart: Date;
  from30: Date;
  weekStart: Date;
};

function ResolvedKpi({ recent }: { recent: Recent | null }) {
  if (!recent)
    return (
      <Kpi
        className="bg-grad-green text-white"
        value="…"
        label="Resolvidos na semana"
        hint="carregando"
      />
    );
  const thisWeek = recent.closed.filter((c) => new Date(c.closed_at!) >= recent.weekStart).length;
  const lastWeek = recent.closed.length - thisWeek;
  return (
    <Kpi
      className="bg-grad-green text-white"
      value={thisWeek}
      label="Resolvidos na semana"
      hint={`semana passada: ${lastWeek}`}
    />
  );
}

function SidePanels({
  recent,
  openCases,
}: {
  recent: Recent | null;
  openCases: { idclinic: string | null }[];
}) {
  if (!recent) return <Loading />;
  const last30 = recent.opened.filter((c) => new Date(c.opened_at) >= recent.from30);

  const clinics = [
    ...groupBy(
      last30.filter((c) => c.idclinic),
      (c) => c.idclinic!,
    ).entries(),
  ]
    .map(([id, list]) => ({
      id,
      n: list.length,
      open: openCases.filter((o) => o.idclinic === id).length,
      top: mostCommon(list.map((c) => c.analyses?.subcategory).filter(Boolean) as string[]),
    }))
    .filter((c) => c.n >= 3)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3);

  const problems = [
    ...groupBy(
      last30.filter((c) => c.analyses?.problem_fingerprint),
      (c) => c.analyses!.problem_fingerprint!,
    ).entries(),
  ]
    .map(([fp, list]) => ({
      fp,
      n: list.length,
      label: list[0].analyses!.problem_label || fp,
      clinics: new Set(list.map((c) => c.idclinic).filter(Boolean)).size,
      module: mostCommon(list.map((c) => c.analyses?.subcategory).filter(Boolean) as string[]),
    }))
    .filter((p) => p.n >= 2)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3);

  const month = recent.opened.filter((c) => new Date(c.opened_at) >= recent.monthStart);
  const sla = (["n2", "chatbot", "am"] as Area[]).map((area) => {
    const measured = month
      .map((c) => ({ c, area: caseArea(c) }))
      .filter((x) => x.area === area)
      .map((x) => firstResponseWithinSla(x.c, area, x.c.analyses?.first_response_minutes ?? null))
      .filter((v): v is boolean => v !== null);
    const pct = measured.length
      ? Math.round((measured.filter(Boolean).length / measured.length) * 100)
      : null;
    return { area, pct, total: measured.length };
  });

  const maxClinic = clinics[0]?.n ?? 1;
  const maxProblem = problems[0]?.n ?? 1;

  return (
    <>
      <section className="card flex flex-col gap-2.5 overflow-hidden px-[18px] pb-3.5 pt-4">
        <h2 className="m-0 text-[15px] font-bold">Clínicas em alerta</h2>
        {clinics.length === 0 && (
          <div className="text-[13px] text-muted-foreground">
            Nenhuma clínica com 3 ou mais casos em 30 dias.
          </div>
        )}
        {clinics.map((c) => (
          <div key={c.id} className="flex items-center gap-3">
            <FlagBar
              value={c.n}
              max={maxClinic}
              tone={c.n >= 5 ? "red" : "orange"}
              min={44}
              span={56}
            />
            <div className="min-w-0">
              <div className="font-medium">IDCLINIC {c.id}</div>
              <div className="text-[12.5px] text-muted-foreground">
                {c.n} casos em 30 dias ·{" "}
                {c.open ? `${c.open} aberto${c.open > 1 ? "s" : ""}` : "nenhum aberto"}
                {c.top ? ` · ${c.top}` : ""}
              </div>
            </div>
          </div>
        ))}
        <SeeMore to="/problemas">Ver todas as clínicas</SeeMore>
      </section>

      <section className="card flex flex-col gap-2.5 overflow-hidden px-[18px] pb-3.5 pt-4">
        <h2 className="m-0 text-[15px] font-bold">Problemas que voltaram</h2>
        {problems.length === 0 && (
          <div className="text-[13px] text-muted-foreground">
            Nenhum problema repetido nos últimos 30 dias.
          </div>
        )}
        {problems.map((p) => (
          <div key={p.fp} className="flex items-center gap-3">
            <FlagBar value={p.n} max={maxProblem} min={44} span={56} />
            <div className="min-w-0">
              <div className="font-medium">{p.label}</div>
              <div className="text-[12.5px] text-muted-foreground">
                {p.clinics} clínica{p.clinics === 1 ? "" : "s"}
                {p.module ? ` · ${p.module}` : ""}
              </div>
            </div>
          </div>
        ))}
        <SeeMore to="/problemas">Ver todos os problemas</SeeMore>
      </section>

      <section className="card flex flex-col gap-3 px-[18px] py-4">
        <div>
          <h2 className="m-0 text-[15px] font-bold">SLA do mês por área</h2>
          <div className="text-[12.5px] text-muted-foreground">
            1ª resposta dentro do prazo, em horas úteis
          </div>
        </div>
        {sla.map((s) => (
          <div key={s.area} className="flex flex-col gap-1">
            <div className="flex justify-between">
              <span className="font-medium">{AREA_NAME[s.area]}</span>
              <span className="font-bold tabular-nums">{s.pct == null ? "—" : `${s.pct}%`}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-bar">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${s.pct ?? 0}%`,
                  background:
                    (s.pct ?? 0) >= 85
                      ? "var(--grad-green-bar)"
                      : (s.pct ?? 0) >= 70
                        ? "var(--grad-orange-bar)"
                        : "var(--grad-red-bar)",
                }}
              />
            </div>
          </div>
        ))}
        <div className="text-[12px] text-muted-foreground">
          Seg a sex, 7h às 22h. P3: 30 min · P2: 2 h · P1: 4 h · AM: 1 h · Chatbot: até 10h do dia
          útil seguinte.
        </div>
      </section>
    </>
  );
}

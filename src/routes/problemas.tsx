import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import {
  DateField,
  Empty,
  ErrorBox,
  FlagBar,
  isoDay,
  Loading,
  PageTitle,
  Pill,
} from "@/components/sa/bits";
import { loadCasesOpenedBetween, useLoader } from "@/lib/data";
import { groupBy, mostCommon } from "@/lib/group";
import { brtMonthStart, brtParts, fmtWhen } from "@/lib/sla";
import { useMounted } from "@/lib/prefs";

type Search = { de?: string; ate?: string };

export const Route = createFileRoute("/problemas")({
  head: () => ({ meta: [{ title: "Problemas que voltam · Suporte Avançado" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    de: typeof s.de === "string" && s.de ? s.de : undefined,
    ate: typeof s.ate === "string" && s.ate ? s.ate : undefined,
  }),
  component: () => (
    <AppShell>
      <Problems />
    </AppShell>
  ),
});

type Level = "Crítica" | "Atenção" | "Observar";
const LEVEL_TONE = { Crítica: "red", Atenção: "orange", Observar: "yellow" } as const;
const level = (n: number): Level => (n >= 5 ? "Crítica" : n >= 4 ? "Atenção" : "Observar");

function Problems() {
  const mounted = useMounted();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/problemas" });
  const de = search.de ?? isoDay(-30);
  const ate = search.ate ?? isoDay(0);
  const set = (patch: Search) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const data = useLoader(
    () =>
      loadCasesOpenedBetween(
        new Date(`${de}T00:00:00-03:00`),
        new Date(new Date(`${ate}T00:00:00-03:00`).getTime() + 86_400_000),
      ),
    [de, ate],
    ["cases", "analyses"],
  );

  const now = brtParts(new Date());
  const monthStart = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    brtMonthStart(now.year, now.month),
  );
  const presets: [string, string, string][] = [
    ["Este mês", monthStart, isoDay(0)],
    ["30 dias", isoDay(-30), isoDay(0)],
    ["90 dias", isoDay(-90), isoDay(0)],
  ];

  const cases = data.data ?? [];
  const clinics = [
    ...groupBy(
      cases.filter((c) => c.idclinic),
      (c) => c.idclinic!,
    ).entries(),
  ]
    .map(([id, list]) => ({
      id,
      n: list.length,
      kinds: new Set(list.map((c) => c.analyses?.problem_fingerprint).filter(Boolean)).size,
      open: list.filter((c) => c.status === "aberto").length,
      top: [...new Set(list.map((c) => c.analyses?.problem_label).filter(Boolean))]
        .slice(0, 2)
        .join(" · "),
    }))
    .filter((c) => c.n >= 2)
    .sort((a, b) => b.n - a.n)
    .slice(0, 12);

  const problems = [
    ...groupBy(
      cases.filter((c) => c.analyses?.problem_fingerprint),
      (c) => c.analyses!.problem_fingerprint!,
    ).entries(),
  ]
    .map(([fp, list]) => ({
      fp,
      n: list.length,
      label: list[0].analyses!.problem_label || fp,
      module: mostCommon(list.map((c) => c.analyses?.subcategory).filter(Boolean) as string[]),
      clinics: new Set(list.map((c) => c.idclinic).filter(Boolean)).size,
      last: list.reduce((a, c) => (c.opened_at > a ? c.opened_at : a), list[0].opened_at),
    }))
    .filter((p) => p.n >= 2)
    .sort((a, b) => b.n - a.n)
    .slice(0, 12);

  return (
    <>
      <PageTitle
        title="Problemas que voltam"
        subtitle="As clínicas que mais precisam de atenção e os problemas que se repetem."
        right={
          <div className="card flex flex-wrap items-end gap-2 px-3 py-2.5">
            <DateField id="p-de" label="De" value={de} onChange={(v) => v && set({ de: v })} />
            <DateField id="p-ate" label="Até" value={ate} onChange={(v) => v && set({ ate: v })} />
            <div role="group" aria-label="Atalhos de período" className="flex gap-1">
              {presets.map(([label, d, a]) => {
                const on = d === de && a === ate;
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ de: d, ate: a })}
                    className={[
                      "h-10 rounded-lg border px-3 text-[13px]",
                      on
                        ? "border-brand bg-brand-soft font-bold text-brand-text"
                        : "border-border bg-card font-medium",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        }
      />

      {data.error && <ErrorBox message={data.error} />}
      {!mounted || (data.loading && !data.data) ? (
        <Loading />
      ) : (
        <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr))]">
          <section aria-labelledby="cli-t" className="card overflow-hidden">
            <div className="border-b border-line px-[18px] py-3.5">
              <h2 id="cli-t" className="m-0 text-base font-bold">
                Clínicas mais críticas
              </h2>
              <div className="text-[12.5px] text-muted-foreground">
                Quantos casos cada clínica abriu no período
              </div>
            </div>
            {clinics.length === 0 && <Empty>Nenhuma clínica com 2 ou mais casos no período.</Empty>}
            {clinics.map((c) => {
              const lv = level(c.n);
              return (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 border-b border-line px-[18px] py-3.5"
                >
                  <FlagBar value={c.n} max={clinics[0].n} unit="casos" tone={LEVEL_TONE[lv]} />
                  <div className="min-w-0 flex-[1_1_180px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <b>IDCLINIC {c.id}</b>
                      <Pill tone={LEVEL_TONE[lv]}>{lv}</Pill>
                    </div>
                    {c.top && <div className="mt-0.5 text-[13px]">{c.top}</div>}
                    <div className="text-[12.5px] text-muted-foreground">
                      {c.kinds
                        ? `${c.kinds} problema${c.kinds === 1 ? "" : "s"} diferente${c.kinds === 1 ? "" : "s"}`
                        : "ainda sem análise da IA"}{" "}
                      ·{" "}
                      {c.open ? `${c.open} aberto${c.open > 1 ? "s" : ""} agora` : "nenhum aberto"}
                    </div>
                  </div>
                  <Link
                    to="/casos"
                    search={{ idclinic: c.id, status: "todos", de, ate }}
                    className="text-[13px] font-bold"
                  >
                    Ver casos
                  </Link>
                </div>
              );
            })}
          </section>

          <section aria-labelledby="rank-t" className="card overflow-hidden">
            <div className="border-b border-line px-[18px] py-3.5">
              <h2 id="rank-t" className="m-0 text-base font-bold">
                Problemas mais repetidos
              </h2>
              <div className="text-[12.5px] text-muted-foreground">
                Quanto maior a barra, mais vezes o problema voltou
              </div>
            </div>
            {problems.length === 0 && <Empty>Nenhum problema repetido no período.</Empty>}
            {problems.map((p) => (
              <div
                key={p.fp}
                className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 border-b border-line px-[18px] py-3.5"
              >
                <FlagBar value={p.n} max={problems[0].n} unit="vezes" />
                <div className="min-w-0 flex-[1_1_180px]">
                  <div className="font-medium">{p.label}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground">
                    {p.module && (
                      <span className="rounded-full bg-hover px-2 py-px font-medium text-foreground">
                        {p.module}
                      </span>
                    )}
                    {p.clinics} clínica{p.clinics === 1 ? "" : "s"} · última vez {fmtWhen(p.last)}
                  </div>
                </div>
                <Link
                  to="/casos"
                  search={{ problema: p.fp, status: "todos", de, ate }}
                  className="text-[13px] font-bold"
                >
                  Ver casos
                </Link>
              </div>
            ))}
          </section>
        </div>
      )}
    </>
  );
}

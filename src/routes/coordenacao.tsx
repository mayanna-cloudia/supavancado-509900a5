import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { RequireAccess, sessionToken } from "@/components/shell/RequireAccess";
import { loadRatings, type Rating } from "@/lib/actions.functions";
import { Empty, ErrorBox, Loading, PageTitle, Pill } from "@/components/sa/bits";
import { downloadCsv, toCsv } from "@/lib/csv";
import { loadCasesClosedBetween, useLoader, type LightCase } from "@/lib/data";
import { brtMonthStart, brtParts, fmtDay, fmtWhen, PERSON_TAG_AREA } from "@/lib/sla";
import { N2_PEOPLE } from "@/lib/team";
import { useMounted } from "@/lib/prefs";

export const Route = createFileRoute("/coordenacao")({
  head: () => ({ meta: [{ title: "Coordenação · Suporte Avançado" }] }),
  component: () => (
    <AppShell>
      <RequireAccess role="coord" title="Coordenação">
        <Coordination />
      </RequireAccess>
    </AppShell>
  ),
});

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const HISTORY = 6;

type Month = { year: number; month: number };
const monthKey = (m: Month) => `${m.year}-${String(m.month).padStart(2, "0")}`;
const shift = (m: Month, n: number): Month => {
  const i = m.year * 12 + (m.month - 1) + n;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
};

/** Só tags de pessoa contam; tags de área (N2, AM) não. */
const personTags = (c: LightCase) => c.person_tags.filter((t) => PERSON_TAG_AREA[t.toLowerCase()]);

function stats(cases: LightCase[], tag: string) {
  const involved = cases.filter((c) => c.person_tags.includes(tag));
  const alone = involved.filter((c) => personTags(c).length === 1);
  const pct = involved.length ? (alone.length / involved.length) * 100 : null;
  return { involved, alone, pct };
}

const fmtPct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1).replace(".", ",")}%`);

function Coordination() {
  const mounted = useMounted();
  const now = brtParts(new Date());
  const current: Month = { year: now.year, month: now.month };
  const [selected, setSelected] = useState(monthKey(current));
  const [person, setPerson] = useState(N2_PEOPLE[0].tag);
  const sel = { year: +selected.slice(0, 4), month: +selected.slice(5) };

  const oldest = shift(sel, -(HISTORY - 1));
  const data = useLoader(
    () =>
      loadCasesClosedBetween(
        brtMonthStart(oldest.year, oldest.month),
        brtMonthStart(shift(sel, 1).year, shift(sel, 1).month),
      ),
    [selected],
    ["cases"],
  );
  // Avaliações enviadas no mês escolhido (lidas no servidor: notas não são públicas)
  const ratings = useLoader(async () => {
    const n = shift(sel, 1);
    const res = await loadRatings({
      data: {
        token: sessionToken(),
        from: brtMonthStart(sel.year, sel.month).toISOString(),
        to: brtMonthStart(n.year, n.month).toISOString(),
      },
    });
    if (!res.ok) throw new Error(res.message);
    return res.rows;
  }, [selected]);

  const inMonth = (m: Month) => {
    const from = brtMonthStart(m.year, m.month).getTime();
    const n = shift(m, 1);
    const to = brtMonthStart(n.year, n.month).getTime();
    return (data.data ?? []).filter((c) => {
      const t = new Date(c.closed_at!).getTime();
      return t >= from && t < to;
    });
  };

  const options = Array.from({ length: 12 }, (_, i) => shift(current, -i));
  const monthCases = inMonth(sel);
  const prevCases = inMonth(shift(sel, -1));
  const history = Array.from({ length: HISTORY }, (_, i) => shift(sel, -i));
  const audit = stats(monthCases, person).involved;

  const exportCsv = () => {
    const rows = history.flatMap((m) => {
      const list = inMonth(m);
      return N2_PEOPLE.map((p) => {
        const s = stats(list, p.tag);
        return [
          `${MONTHS[m.month - 1]}/${m.year}`,
          p.name,
          s.alone.length,
          s.involved.length,
          s.pct == null ? "" : Math.round(s.pct * 10) / 10,
        ];
      });
    });
    downloadCsv(
      `pdi-n2-${selected}.csv`,
      toCsv(
        ["Mês", "Pessoa", "Resolvidos sozinho(a)", "Envolvidos", "% resolvido sozinho(a)"],
        rows,
      ),
    );
  };

  return (
    <>
      <PageTitle
        title={`PDI do Suporte N2 · ${MONTHS[sel.month - 1]}`}
        subtitle="Contado pelas tags de pessoa nos tópicos fechados no mês."
        right={
          <div className="flex items-center gap-2">
            <label htmlFor="mes" className="text-[13px] text-muted-foreground">
              Mês
            </label>
            <select
              id="mes"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="h-10 rounded-lg border border-border bg-card px-3 text-foreground"
            >
              {options.map((m) => (
                <option key={monthKey(m)} value={monthKey(m)}>
                  {MONTHS[m.month - 1]} de {m.year}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={exportCsv}
              className="h-10 rounded-lg border border-border bg-card px-3.5 text-foreground"
            >
              Exportar CSV
            </button>
          </div>
        }
      />

      {data.error && <ErrorBox message={data.error} />}
      {!mounted || (data.loading && !data.data) ? (
        <Loading />
      ) : (
        <>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))]">
            {N2_PEOPLE.map((p) => {
              const s = stats(monthCases, p.tag);
              const prev = stats(prevCases, p.tag);
              return (
                <section key={p.tag} className="card overflow-hidden">
                  <div className="flex items-center gap-3 border-b border-line px-[18px] py-3.5">
                    <div className="bg-grad-brand flex h-10 w-10 items-center justify-center rounded-full font-bold text-white">
                      {p.name
                        .split(" ")
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join("")}
                    </div>
                    <div>
                      <div className="text-base font-bold">{p.name}</div>
                      <div className="text-[12.5px] text-muted-foreground">
                        tag no Discord: <b className="text-foreground">{p.tag}</b>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3">
                    <Metric
                      value={s.alone.length}
                      label="Resolvidos sozinho(a)"
                      hint="só a tag dela(e)"
                    />
                    <Metric
                      value={s.involved.length}
                      label="Envolvidos"
                      hint="todos com a tag dela(e)"
                    />
                    <div className="bg-grad-brand px-[18px] py-4 text-white">
                      <div className="text-[30px] font-bold leading-tight tabular-nums">
                        {fmtPct(s.pct)}
                      </div>
                      <div className="font-medium">Resolveu sozinho(a)</div>
                      <div className="text-xs">
                        {s.alone.length} ÷ {s.involved.length}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 px-[18px] py-3">
                    <div className="h-2 overflow-hidden rounded-full bg-bar">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${s.pct ?? 0}%`, background: "var(--grad-brand-bar)" }}
                      />
                    </div>
                    <div className="text-[12.5px] text-muted-foreground">
                      Mês anterior: {fmtPct(prev.pct)} ({prev.alone.length} de{" "}
                      {prev.involved.length})
                    </div>
                    <RatingLine
                      rows={(ratings.data ?? []).filter((r) => r.resolver_name === p.name)}
                    />
                  </div>
                </section>
              );
            })}
          </div>

          <RatingsSection
            rows={(ratings.data ?? []).filter((r) =>
              N2_PEOPLE.some((p) => p.name === r.resolver_name),
            )}
            error={ratings.error}
          />

          <div className="flex flex-wrap items-start gap-4">
            <section
              aria-labelledby="hist-t"
              className="card min-w-0 flex-[1_1_420px] overflow-hidden"
            >
              <div className="border-b border-line px-[18px] py-3.5">
                <h2 id="hist-t" className="m-0 text-base font-bold">
                  Mês a mês
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[460px] border-collapse">
                  <thead>
                    <tr className="text-left text-[12.5px] text-muted-foreground">
                      <th className="px-[18px] py-2.5 font-medium">Mês</th>
                      <th className="px-2 py-2.5 font-medium">Pessoa</th>
                      <th className="px-2 py-2.5 text-right font-medium">Sozinho(a)</th>
                      <th className="px-2 py-2.5 text-right font-medium">Envolvidos</th>
                      <th className="px-[18px] py-2.5 text-right font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.flatMap((m) => {
                      const list = inMonth(m);
                      return N2_PEOPLE.map((p) => {
                        const s = stats(list, p.tag);
                        return (
                          <tr key={`${monthKey(m)}-${p.tag}`} className="border-t border-line">
                            <td className="px-[18px] py-2.5 capitalize">{MONTHS[m.month - 1]}</td>
                            <td className="px-2 py-2.5">{p.name}</td>
                            <td className="px-2 py-2.5 text-right tabular-nums">
                              {s.alone.length}
                            </td>
                            <td className="px-2 py-2.5 text-right tabular-nums">
                              {s.involved.length}
                            </td>
                            <td className="px-[18px] py-2.5 text-right font-bold tabular-nums">
                              {fmtPct(s.pct)}
                            </td>
                          </tr>
                        );
                      });
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section
              aria-labelledby="aud-t"
              className="card min-w-0 flex-[1_1_420px] overflow-hidden"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-[18px] py-3">
                <h2 id="aud-t" className="m-0 text-base font-bold">
                  Casos que entraram na conta
                </h2>
                <div role="group" aria-label="Pessoa" className="flex gap-1">
                  {N2_PEOPLE.map((p) => (
                    <button
                      key={p.tag}
                      type="button"
                      aria-pressed={person === p.tag}
                      onClick={() => setPerson(p.tag)}
                      className={[
                        "h-[34px] rounded-lg border px-3 text-[13px]",
                        person === p.tag
                          ? "border-brand bg-brand-soft font-bold text-brand-text"
                          : "border-border bg-card",
                      ].join(" ")}
                    >
                      {p.tag}
                    </button>
                  ))}
                </div>
              </div>
              {audit.length === 0 && <Empty>Nenhum tópico fechado com essa tag no mês.</Empty>}
              {audit.map((c) => {
                const alone = personTags(c).length === 1;
                return (
                  <div
                    key={c.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-[18px] py-3"
                  >
                    <div className="min-w-0 flex-[1_1_200px]">
                      <Link
                        to="/casos"
                        search={{ caso: c.id, status: "todos" }}
                        className="font-medium text-foreground no-underline hover:text-foreground"
                      >
                        {c.thread_title}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {c.priority && (
                          <span className="rounded-full bg-hover px-2 py-px text-xs">
                            {c.priority}
                          </span>
                        )}
                        {[...c.area_tags, ...c.person_tags].map((t) => (
                          <span key={t} className="rounded-full bg-hover px-2 py-px text-xs">
                            {t}
                          </span>
                        ))}
                        <span className="px-1 text-xs text-muted-foreground">
                          fechado {fmtDay(c.closed_at!)}
                        </span>
                      </div>
                    </div>
                    <Pill tone={alone ? "green" : "gray"}>
                      {alone ? "Sozinho(a)" : "Com outra pessoa"}
                    </Pill>
                  </div>
                );
              })}
            </section>
          </div>

          <section className="card flex flex-col gap-1 px-[18px] py-3.5 text-[13.5px]">
            <div className="font-bold">Como contamos</div>
            <div>
              Envolvidos: tópicos fechados no mês que têm a tag da pessoa. Resolvidos sozinho(a):
              desses, os que não têm tag de nenhuma outra pessoa. Tags de área (N2, AM) e de
              prioridade não entram na conta.
            </div>
          </section>
        </>
      )}
    </>
  );
}

function Metric({ value, label, hint }: { value: number; label: string; hint: string }) {
  return (
    <div className="border-r border-line px-[18px] py-4">
      <div className="text-[30px] font-bold leading-tight tabular-nums">{value}</div>
      <div className="font-medium">{label}</div>
      <div className="text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

function ratingSummary(rows: Rating[]) {
  const answered = rows.filter((r) => r.score != null);
  const avg = answered.length ? answered.reduce((a, r) => a + r.score!, 0) / answered.length : null;
  return { answered, avg, sent: rows.filter((r) => r.status !== "falhou").length };
}

/** Nota média de uma pessoa no mês, no card do PDI. */
function RatingLine({ rows }: { rows: Rating[] }) {
  const { answered, avg, sent } = ratingSummary(rows);
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      <span className="font-medium">Avaliação do atendimento:</span>
      {avg == null ? (
        <span className="text-muted-foreground">
          {sent ? `${sent} enviada(s), nenhuma respondida ainda` : "nenhuma no mês"}
        </span>
      ) : (
        <>
          <span className="text-[#c99400]">{stars(Math.round(avg))}</span>
          <b className="tabular-nums">{avg.toFixed(1).replace(".", ",")}</b>
          <span className="text-muted-foreground">
            ({answered.length} de {sent} responderam)
          </span>
        </>
      )}
    </div>
  );
}

/** Lista das avaliações respondidas no mês, com os comentários. */
function RatingsSection({ rows, error }: { rows: Rating[]; error: string | null }) {
  const answered = rows.filter((r) => r.score != null);
  return (
    <section aria-labelledby="aval-t" className="card overflow-hidden">
      <div className="border-b border-line px-[18px] py-3.5">
        <h2 id="aval-t" className="m-0 text-base font-bold">
          Avaliações do atendimento
        </h2>
        <div className="text-[12.5px] text-muted-foreground">
          Quem abriu o tópico recebe uma mensagem no Discord quando ele fecha e tem 2 dias para dar
          a nota.
        </div>
      </div>
      {error && <ErrorBox message={error} />}
      {!error && answered.length === 0 && <Empty>Nenhuma avaliação respondida neste mês.</Empty>}
      {answered.map((r) => (
        <div
          key={r.case_id}
          className="flex flex-wrap items-start gap-x-4 gap-y-1 border-b border-line px-[18px] py-3"
        >
          <div className="min-w-[110px]">
            <div className="text-[#c99400]">{stars(r.score!)}</div>
            <div className="text-xs text-muted-foreground">
              {fmtWhen(r.answered_at ?? r.sent_at)}
            </div>
          </div>
          <div className="min-w-0 flex-[1_1_260px]">
            <div className="font-medium">{r.cases?.thread_title ?? `Caso ${r.case_id}`}</div>
            <div className="text-[12.5px] text-muted-foreground">
              {r.resolver_name} · avaliado por {r.rater_name ?? "quem abriu o tópico"}
            </div>
            {r.comment && <div className="mt-1 text-[13.5px]">“{r.comment}”</div>}
          </div>
        </div>
      ))}
    </section>
  );
}

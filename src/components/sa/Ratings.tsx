import { useEffect, useState } from "react";
import { sessionToken } from "@/components/shell/RequireAccess";
import { Empty, Pill } from "@/components/sa/bits";
import { loadCaseRating, type Rating } from "@/lib/actions.functions";
import { fmtWhen } from "@/lib/sla";

export function Stars({ n }: { n: number }) {
  return (
    <span className="tracking-wide text-[#c99400]" aria-label={`${n} de 5`}>
      {"★".repeat(n)}
      {"☆".repeat(5 - n)}
    </span>
  );
}

const fmtAvg = (v: number) => v.toFixed(1).replace(".", ",");

/** Média, respondidas e enviadas por resolvedor, mais notas primeiro. */
export function RatingSummary({ rows }: { rows: Rating[] }) {
  const by = new Map<string, Rating[]>();
  for (const r of rows) {
    const k = r.resolver_name ?? "—";
    by.set(k, [...(by.get(k) ?? []), r]);
  }
  const people = [...by.entries()]
    .map(([name, list]) => {
      const answered = list.filter((r) => r.score != null);
      return {
        name,
        team: list[0].resolver_team,
        answered: answered.length,
        sent: list.filter((r) => r.status !== "falhou").length,
        avg: answered.length ? answered.reduce((a, r) => a + r.score!, 0) / answered.length : null,
      };
    })
    .sort((a, b) => b.answered - a.answered);
  if (!people.length) return <Empty>Nenhuma avaliação enviada no período.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse">
        <thead>
          <tr className="text-left text-[12.5px] text-muted-foreground">
            <th className="px-[18px] py-2.5 font-medium">Pessoa</th>
            <th className="px-2 py-2.5 font-medium">Área</th>
            <th className="px-2 py-2.5 font-medium">Média</th>
            <th className="px-[18px] py-2.5 text-right font-medium">Responderam</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.name} className="border-t border-line">
              <td className="px-[18px] py-2.5 font-medium">{p.name}</td>
              <td className="px-2 py-2.5 text-muted-foreground">{p.team ?? "—"}</td>
              <td className="px-2 py-2.5">
                {p.avg == null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Stars n={Math.round(p.avg)} /> <b className="tabular-nums">{fmtAvg(p.avg)}</b>
                  </span>
                )}
              </td>
              <td className="px-[18px] py-2.5 text-right tabular-nums">
                {p.answered} de {p.sent}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function statusPill(r: Rating) {
  if (r.score != null) return null;
  if (r.status === "falhou") return <Pill tone="gray">Mensagem bloqueada</Pill>;
  if (new Date(r.expires_at) < new Date()) return <Pill tone="gray">Prazo encerrado</Pill>;
  return <Pill tone="yellow">Aguardando resposta</Pill>;
}

/** Lista de avaliações (respondidas e pendentes), com comentário. */
export function RatingsList({
  rows,
  onlyAnswered = false,
}: {
  rows: Rating[];
  onlyAnswered?: boolean;
}) {
  const list = onlyAnswered ? rows.filter((r) => r.score != null) : rows;
  if (!list.length) return <Empty>Nenhuma avaliação no período.</Empty>;
  return (
    <>
      {list.map((r) => (
        <div
          key={r.case_id}
          className="flex flex-wrap items-start gap-x-4 gap-y-1 border-b border-line px-[18px] py-3"
        >
          <div className="min-w-[120px]">
            {r.score != null ? <Stars n={r.score} /> : statusPill(r)}
            <div className="text-xs text-muted-foreground">
              {fmtWhen(r.answered_at ?? r.sent_at)}
            </div>
          </div>
          <div className="min-w-0 flex-[1_1_260px]">
            <div className="font-medium">{r.cases?.thread_title ?? `Caso ${r.case_id}`}</div>
            <div className="text-[12.5px] text-muted-foreground">
              {r.resolver_name ?? "—"}
              {r.resolver_team ? ` (${r.resolver_team})` : ""} · avaliado por{" "}
              {r.rater_name ?? "quem abriu o tópico"}
            </div>
            {r.comment && <div className="mt-1 text-[13.5px]">“{r.comment}”</div>}
          </div>
        </div>
      ))}
    </>
  );
}

/** Nota de um caso no detalhe. Só aparece para quem entrou como Coordenação ou Admin. */
export function CaseRatingBox({ caseId }: { caseId: number }) {
  const [state, setState] = useState<{ rating: Rating | null } | null>(null);
  useEffect(() => {
    const token = sessionToken();
    setState(null);
    if (!token) return;
    let alive = true;
    loadCaseRating({ data: { token, caseId } }).then((res) => {
      if (alive && res.ok) setState({ rating: res.rating });
    });
    return () => {
      alive = false;
    };
  }, [caseId]);
  if (!state?.rating) return null;
  const r = state.rating;
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-hover px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
        <span className="font-medium">Avaliação do atendimento · {r.resolver_name ?? "—"}</span>
        <span className="text-[11px] text-muted-foreground">
          visível só para Coordenação e Admin
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {r.score != null ? <Stars n={r.score} /> : statusPill(r)}
        <span className="text-[12.5px] text-muted-foreground">
          {r.rater_name ?? "quem abriu o tópico"} · {fmtWhen(r.answered_at ?? r.sent_at)}
        </span>
      </div>
      {r.comment && <div className="text-[13.5px]">“{r.comment}”</div>}
    </div>
  );
}

import type { ReactNode } from "react";
import {
  AvaliacaoPreview,
  BoletimPreview,
  CasosPreview,
  HojePreview,
  LembretesPreview,
  LinksPreview,
  ProblemasPreview,
} from "./NovidadesPreviews";

// Novidades do Suporte Avançado 2.0 (o mesmo conteúdo da página enviada ao time),
// mostradas antes do formulário de feedback.

function Block({ tag, title, children }: { tag: string; title: string; children: ReactNode }) {
  return (
    <section className="card flex flex-col gap-2.5 px-5 py-[18px]">
      <span className="self-start rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-bold text-brand-text">
        {tag}
      </span>
      <h2 className="m-0 text-lg font-bold [text-wrap:balance]">{title}</h2>
      {children}
    </section>
  );
}

const LINKS: [string, string][] = [
  ["supavancado.lovable.app/?idclinic=372", "Casos da clínica 372"],
  ["supavancado.lovable.app/?idclinic=372&priority=P1&status=open", "Clínica 372, só P1 em aberto"],
  ["supavancado.lovable.app/?tab=sla&area=SuporteN2", "Tela Hoje, já na fila do N2"],
  ["supavancado.lovable.app/?q=login", "Casos que falam de “login”, no título ou na conversa"],
];

const STEPS: [string, string][] = [
  ["1 dia útil", "1º lembrete no tópico, marcando quem precisa responder"],
  ["3 dias úteis", "2º lembrete, avisando que o tópico vai ser encerrado"],
  ["5 dias úteis", "Tópico fechado como “sem retorno”, e o time é avisado"],
];

export function Novidades() {
  return (
    <div className="flex flex-col gap-4">
      <Block tag="Painel" title="Para o dia a dia">
        <ul className="m-0 flex flex-col gap-1.5 pl-5">
          <li>
            <b>Hoje:</b> a fila de quem está esperando o time, separada por N2, Chatbot e AM, com a
            barrinha do SLA. Tem um aviso quando algum caso passa de 2 dias úteis parado.
          </li>
          <li>
            <b>Esperando a clínica:</b> casos em que a bola está com quem abriu o tópico ficam
            separados e não contam no SLA.
          </li>
          <li>
            <b>Com a minha tag:</b> clique em “quem é você?” no topo e escolha seu nome uma vez. A
            aba mostra só os casos com a sua tag no Discord. Sem cadastro e sem senha.
          </li>
          <li>
            <b>Casos:</b> a busca procura também no texto das conversas. Anexos aparecem como “📎
            ver no Discord”. Cada caso mostra os outros casos da mesma clínica e dá para ler a
            conversa em tela cheia.
          </li>
          <li>
            <b>Problemas que voltam:</b> as clínicas com mais casos e os problemas que se repetem,
            com o período que você escolher.
          </li>
          <li>Modo escuro e menu que recolhe, iguais aos do app Cloudia.</li>
        </ul>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
          <HojePreview />
          <CasosPreview />
        </div>
        <ProblemasPreview />
      </Block>

      <Block tag="Painel" title="Links que já abrem filtrados">
        <p className="m-0">
          Dá para mandar para alguém um link que já abre o painel no recorte certo. Os links do
          painel antigo continuam funcionando.
        </p>
        <div className="flex flex-col gap-2">
          {LINKS.map(([url, what]) => (
            <a
              key={url}
              href={`https://${url}`}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[10px] border border-border px-3 py-2 no-underline"
            >
              <code className="font-mono text-[13px] font-medium text-brand-text [overflow-wrap:anywhere]">
                {url}
              </code>
              <span className="text-[13.5px] text-muted-foreground">{what}</span>
            </a>
          ))}
        </div>
        <p className="m-0 text-[13.5px] text-muted-foreground">
          Também valem <code>priority</code> (P1, P2, P3), <code>status</code> (open, resolved,
          all), <code>area</code> (SuporteN2, Chatbot, AM, unassigned), <code>category</code> (Bug,
          Configuração…) e <code>tab</code> (cases, sla, team, metrics). Ou filtre na tela Casos e
          copie o endereço da barra: os filtros vão junto.
        </p>
        <LinksPreview />
      </Block>

      <Block tag="Bot do Discord" title="Lembretes quando quem abriu o tópico some">
        <p className="m-0 text-[13.5px] text-muted-foreground">
          Contado em dias úteis desde a última mensagem do time. Se a pessoa responder, a contagem
          zera.
        </p>
        <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr))]">
          {STEPS.map(([when, what]) => (
            <div
              key={when}
              className="flex min-w-0 flex-col gap-0.5 rounded-[10px] border border-border px-3 py-2.5"
            >
              <b className="text-[13px] text-brand-text">{when}</b>
              <span className="text-[13.5px]">{what}</span>
            </div>
          ))}
        </div>
        <LembretesPreview />
      </Block>

      <Block tag="Bot do Discord" title="Avaliação do atendimento">
        <ul className="m-0 flex flex-col gap-1.5 pl-5">
          <li>
            Quando o tópico fecha, quem abriu recebe uma <b>mensagem direta</b> do bot para dar uma
            nota de 1 a 5 para quem resolveu, e pode deixar um comentário.
          </li>
          <li>
            O prazo é de <b>2 dias</b>. As notas não são públicas: ficam com a coordenação.
          </li>
        </ul>
        <AvaliacaoPreview />
      </Block>

      <Block tag="Discord" title="Boletim da semana mais curto">
        <p className="m-0">
          Uma mensagem só no Discord, para ler em 1 minuto: os 3 problemas que mais apareceram, a
          causa mais comum e o que conferir antes de escalar.
        </p>
        <BoletimPreview />
      </Block>
    </div>
  );
}

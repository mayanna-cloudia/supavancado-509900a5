import { ExternalLink, Paperclip, Search } from "lucide-react";
import type { ReactNode } from "react";

// Prévias desenhadas de cada novidade, com dados de exemplo (nada de clínica real).
// Painel: mesmo visual do app. Discord: imita o tema escuro do Discord, de propósito em um tema só.

/** Moldura de "como fica", com o rótulo de exemplo. */
export function PreviewFrame({
  label,
  children,
  dark = false,
}: {
  label: string;
  children: ReactNode;
  dark?: boolean;
}) {
  return (
    <figure className="m-0 flex flex-col gap-1.5">
      <div
        className={[
          "overflow-hidden rounded-xl border p-3",
          dark ? "border-[#1e1f22] bg-[#313338] text-[#dbdee1]" : "border-border bg-background",
        ].join(" ")}
        aria-hidden
      >
        {children}
      </div>
      <figcaption className="text-[12px] text-muted-foreground">
        {label} · exemplo ilustrativo
      </figcaption>
    </figure>
  );
}

const pill = "inline-flex shrink-0 items-center rounded-full px-2 py-px text-[11px] font-bold";

function MiniKpi({ value, label, className }: { value: string; label: string; className: string }) {
  return (
    <div className={`flex min-w-0 flex-col rounded-lg px-2.5 py-2 ${className}`}>
      <span className="truncate text-[10.5px] font-medium">{label}</span>
      <span className="text-xl font-bold leading-tight tabular-nums">{value}</span>
    </div>
  );
}

function QueueRow({
  p,
  tone,
  title,
  meta,
  wait,
  pct,
  bar,
}: {
  p: string;
  tone: string;
  title: string;
  meta: string;
  wait: string;
  pct: number;
  bar: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line px-3 py-2">
      <span className={`${pill} ${tone}`}>{p}</span>
      <div className="min-w-0 flex-[1_1_160px]">
        <div className="truncate text-[12.5px] font-medium">{title}</div>
        <div className="truncate text-[11px] text-muted-foreground">{meta}</div>
      </div>
      <div className="flex w-[110px] flex-col gap-1">
        <span className={`text-[11px] font-bold ${pct >= 100 ? "text-red" : ""}`}>{wait}</span>
        <div className="h-1 overflow-hidden rounded-full bg-bar">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.min(pct, 100)}%`, background: bar }}
          />
        </div>
      </div>
    </div>
  );
}

export function HojePreview() {
  return (
    <PreviewFrame label="Tela Hoje">
      <div className="flex flex-col gap-2.5">
        <div className="rounded-md bg-orange-bg px-2.5 py-1.5 text-[11.5px] font-medium text-orange">
          ⚠ 2 casos parados há mais de 2 dias úteis sem resposta do time
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniKpi value="7" label="Esperando o time" className="bg-grad-brand text-white" />
          <MiniKpi value="2" label="Fora do SLA" className="bg-grad-red text-white" />
          <MiniKpi
            value="5"
            label="Esperando a clínica"
            className="bg-grad-yellow text-[#3d2e00]"
          />
          <MiniKpi value="18" label="Resolvidos na semana" className="bg-grad-green text-white" />
        </div>
        <div className="card overflow-hidden">
          <div className="flex gap-3 overflow-x-auto px-3 pt-2 text-[11.5px]">
            <span className="border-b-2 border-brand pb-1.5 font-bold text-brand-text">
              Todos 7
            </span>
            <span className="pb-1.5 text-muted-foreground">Com a minha tag 2</span>
            <span className="pb-1.5 text-muted-foreground">N2 3</span>
            <span className="pb-1.5 text-muted-foreground">Chatbot 2</span>
            <span className="pb-1.5 text-muted-foreground">Esperando clínica 5</span>
          </div>
          <QueueRow
            p="P3"
            tone="bg-red-bg text-red"
            title="Bot parou de responder no WhatsApp"
            meta="IDCLINIC 0000 · Suporte N2 · Mayanna"
            wait="há 41 min"
            pct={137}
            bar="linear-gradient(90deg,#e5484d,#b42318)"
          />
          <QueueRow
            p="P2"
            tone="bg-orange-bg text-orange"
            title="Confirmação saindo duplicada"
            meta="IDCLINIC 0000 · Suporte N2 · G. Augusto"
            wait="há 1 h 32"
            pct={77}
            bar="linear-gradient(90deg,#f5a524,#c2570c)"
          />
          <QueueRow
            p="P1"
            tone="bg-yellow-bg text-yellow"
            title="Ajustar texto do lembrete"
            meta="IDCLINIC 0000 · Chatbot · sem responsável"
            wait="há 50 min"
            pct={21}
            bar="var(--grad-brand-bar)"
          />
        </div>
      </div>
    </PreviewFrame>
  );
}

function Bubble({
  ini,
  who,
  when,
  ours,
  children,
}: {
  ini: string;
  who: string;
  when: string;
  ours?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-2">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${ours ? "bg-[#0e7c6b]" : "bg-[#6b63fd]"}`}
      >
        {ini}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="text-[11px]">
          <b>{who}</b> <span className="text-muted-foreground">· {when}</span>
        </div>
        <div
          className={`self-start rounded-[4px_10px_10px_10px] px-2.5 py-1.5 text-[12px] [overflow-wrap:anywhere] ${ours ? "bg-brand-soft" : "bg-hover"}`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

const mention = "rounded bg-brand-soft px-1 font-medium text-brand-text";

export function CasosPreview() {
  return (
    <PreviewFrame label="Detalhe do caso">
      <div className="card flex flex-col gap-2.5 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`${pill} bg-yellow-bg text-yellow`}>P1</span>
          <span className={`${pill} bg-brand-soft text-brand-text`}>Esperando o time</span>
          <span className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px]">
            ⤢ Ver em tela cheia
          </span>
        </div>
        <div className="text-[13.5px] font-bold">0000 · Agenda sem horários na IA</div>
        <Bubble ini="PV" who="Pós-Venda" when="hoje 9h02">
          <span className={mention}>@N2</span> a IA diz que não tem horário, mas a agenda está
          livre.
          <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-brand-text">
            <Paperclip className="h-3 w-3" /> 2 imagens · ver no Discord{" "}
            <ExternalLink className="h-2.5 w-2.5" />
          </div>
        </Bubble>
        <Bubble ini="MA" who="Mayanna" when="hoje 9h14" ours>
          Vi aqui, <span className={mention}>@Leandro César</span> consegue olhar o filtro de
          profissionais?
        </Bubble>
        <div className="border-t border-line pt-2">
          <div className="text-[10.5px] font-bold tracking-[0.06em] text-muted-foreground">
            OUTROS CASOS DO IDCLINIC 0000
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11.5px]">
            <span className={`${pill} bg-yellow-bg text-yellow`}>P1</span>
            <span className="min-w-0 flex-1 truncate">Lembrete no horário errado · 02/10</span>
            <span className={`${pill} bg-green-bg text-green`}>Resolvido</span>
          </div>
        </div>
      </div>
    </PreviewFrame>
  );
}

function Flag({ n, w, grad, unit }: { n: number; w: number; grad: string; unit: string }) {
  return (
    <div
      className="-ml-3 flex h-7 shrink-0 items-center justify-end rounded-r-full pr-2.5 font-bold text-white"
      style={{ width: w, background: grad }}
    >
      <span className="text-[13px]">{n}</span>
      <span className="ml-1 text-[9.5px] font-medium">{unit}</span>
    </div>
  );
}

export function ProblemasPreview() {
  const rows: [number, number, string, string, string][] = [
    [6, 150, "var(--grad-red-bar)", "IDCLINIC 0000", "Crítica"],
    [4, 120, "var(--grad-orange-bar)", "IDCLINIC 0000", "Atenção"],
    [3, 100, "var(--grad-yellow-bar)", "IDCLINIC 0000", "Observar"],
  ];
  return (
    <PreviewFrame label="Problemas que voltam">
      <div className="card overflow-hidden">
        <div className="border-b border-line px-3 py-2 text-[12.5px] font-bold">
          Clínicas mais críticas
        </div>
        {rows.map(([n, w, grad, name, level]) => (
          <div key={level} className="flex items-center gap-3 border-b border-line px-3 py-2">
            <Flag n={n} w={w} grad={grad} unit="casos" />
            <span className="min-w-0 flex-1 truncate text-[12px] font-bold">{name}</span>
            <span className="text-[11px] text-muted-foreground">{level}</span>
          </div>
        ))}
      </div>
    </PreviewFrame>
  );
}

export function LinksPreview() {
  return (
    <PreviewFrame label="Link copiado da barra do navegador">
      <div className="flex flex-col gap-2">
        <div className="flex min-w-0 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[12px]">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate font-mono">
            supavancado.lovable.app/?idclinic=372&amp;priority=P1
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
          <span className="text-muted-foreground">abre Casos com:</span>
          <span className={`${pill} bg-brand-soft text-brand-text`}>IDCLINIC 372</span>
          <span className={`${pill} bg-brand-soft text-brand-text`}>P1</span>
          <span className={`${pill} bg-brand-soft text-brand-text`}>Abertos</span>
        </div>
      </div>
    </PreviewFrame>
  );
}

/** Mensagem no tema escuro do Discord. */
function DiscordMsg({ time, children }: { time: string; children: ReactNode }) {
  return (
    <div className="flex gap-2.5 py-1">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#3760ff] text-[11px] font-bold text-white">
        N2
      </span>
      <div className="min-w-0 text-[13px] leading-snug">
        <div className="flex items-center gap-1.5">
          <b className="text-white">BOT do Suporte N2</b>
          <span className="rounded bg-[#5865f2] px-1 text-[9.5px] font-bold text-white">APP</span>
          <span className="text-[11px] text-[#949ba4]">{time}</span>
        </div>
        <div className="[overflow-wrap:anywhere]">{children}</div>
      </div>
    </div>
  );
}

const dMention = "rounded bg-[#5865f2]/30 px-0.5 text-[#c9cdfb]";

export function LembretesPreview() {
  return (
    <PreviewFrame label="No tópico do Discord" dark>
      <DiscordMsg time="qua 09:00">
        👋 Oi <span className={dMention}>@Pós-Venda</span>! O time respondeu aqui e está esperando o
        seu retorno para seguir com o caso. Consegue dar uma olhada?
      </DiscordMsg>
      <DiscordMsg time="sex 09:00">
        ⏳ <span className={dMention}>@Pós-Venda</span>, ainda estamos aguardando o seu retorno. Se
        não houver resposta em <b className="text-white">2 dias úteis</b>, o tópico será encerrado
        automaticamente.
      </DiscordMsg>
    </PreviewFrame>
  );
}

export function AvaliacaoPreview() {
  return (
    <PreviewFrame label="Mensagem direta do bot" dark>
      <DiscordMsg time="hoje 16:30">
        ⭐ <b className="text-white">Como foi o atendimento de Leandro César?</b>
        <br />
        Tópico: <i>0000 · Agenda sem horários na IA</i>
        <br />
        Sua nota ajuda o time a melhorar. Dá para responder até 22/10, 16:30.
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className={`rounded px-2.5 py-1 text-[12px] font-medium text-white ${n === 5 ? "bg-[#248046]" : "bg-[#4e5058]"}`}
            >
              {n} ⭐
            </span>
          ))}
        </div>
        <span className="mt-1.5 inline-block rounded bg-[#5865f2] px-2.5 py-1 text-[12px] font-medium text-white">
          Deixar comentário
        </span>
      </DiscordMsg>
    </PreviewFrame>
  );
}

export function BoletimPreview() {
  return (
    <PreviewFrame label="Boletim colado no canal" dark>
      <DiscordMsg time="seg 08:00">
        📋 <b className="text-white">Boletim do Suporte Avançado · 12 a 18/10</b>
        <br />
        <b className="text-white">40 casos resolvidos</b> · Lembretes 13 · Agenda 8 · IA 7
        <br />
        <br />
        🔥 <b className="text-white">O que mais apareceu</b>
        <br />
        <b className="text-white">1. Lembretes que não chegaram</b> (13)
        <br />
        Causa mais comum: clínica desabilitada ou consulta fora do sistema de agenda.
        <br />✅ Antes de escalar: confira se a clínica estava ativa.
        <br />
        <span className="text-[#949ba4]">…mais 2 destaques e onde escalar</span>
      </DiscordMsg>
    </PreviewFrame>
  );
}

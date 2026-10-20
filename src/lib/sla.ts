// Regras de horário comercial e SLA. Precisam bater com o bot (sla-alert.js) e com a
// função analyze-case: seg a sex, 7h-22h, America/Sao_Paulo.
import type { Case, Message, Priority, WaitingFor } from "./supabase";
import { lookupMember, isResolutive } from "./team";

export const TIME_ZONE = "America/Sao_Paulo";
export const BUSINESS_START_HOUR = 7;
export const BUSINESS_END_HOUR = 22;

/** SLA da 1ª resposta, em minutos úteis. Chatbot não tem minutos: responde até 10h do dia útil seguinte. */
export const SLA_N2: Record<Priority, number> = { P1: 4 * 60, P2: 2 * 60, P3: 30 };
export const SLA_AM = 60;

export type Area = "n2" | "chatbot" | "am";
export const AREA_NAME: Record<Area, string> = {
  n2: "Suporte N2",
  chatbot: "Chatbot",
  am: "Área de Membros",
};

// Cargos do Discord mencionados ao passar o caso para outra área (mesmos ids do bot)
const ROLE_IDS: Record<Area, string> = {
  n2: "1418600381885186268",
  chatbot: "801052794143637504",
  am: "801052551554400276",
};

// Tags de pessoa (nome exato no Discord) → área. Mesmo mapa do bot.
export const PERSON_TAG_AREA: Record<string, Area> = {
  mayanna: "n2",
  "g. augusto": "n2",
  "gabriel augusto": "n2",
  leandro: "chatbot",
  "m. brito": "chatbot",
  "mateus brito": "chatbot",
  bruno: "chatbot",
  eduardo: "chatbot",
  gabi: "chatbot",
  "gabriela bispo": "chatbot",
  murilo: "chatbot",
  hudson: "am",
  luan: "am",
  "m. bernardi": "am",
  "matheus bernardi": "am",
  robert: "am",
};
const AREA_TAG_AREA: Record<string, Area> = {
  n2: "n2",
  "suporte n2": "n2",
  chatbot: "chatbot",
  am: "am",
  "área de membros": "am",
  "area de membros": "am",
};

const BRT_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function brtParts(date: Date) {
  const p = Object.fromEntries(BRT_PARTS.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    year: +p.year,
    month: +p.month, // 1-12
    day: +p.day,
    hour: +p.hour % 24,
    minute: +p.minute,
    weekday: WEEKDAYS.indexOf(p.weekday), // 0 = domingo
  };
}

function isBusinessMinute(date: Date) {
  const p = brtParts(date);
  return (
    p.weekday >= 1 && p.weekday <= 5 && p.hour >= BUSINESS_START_HOUR && p.hour < BUSINESS_END_HOUR
  );
}

/** Minutos úteis entre duas datas, minuto a minuto (limite de 30 dias, como no bot). */
export function businessMinutesBetween(start: Date, end: Date): number {
  if (end <= start) return 0;
  const limit = Math.min(end.getTime(), start.getTime() + 30 * 24 * 60 * 60 * 1000);
  let total = 0;
  // Fora do expediente anda de hora em hora até a próxima hora cheia; dentro, minuto a minuto
  for (let t = start.getTime(); t < limit;) {
    const d = new Date(t);
    if (isBusinessMinute(d)) {
      total += 1;
      t += 60_000;
    } else {
      const p = brtParts(d);
      t += (60 - p.minute) * 60_000 - d.getSeconds() * 1000 - d.getMilliseconds();
    }
  }
  return total;
}

/** Dias úteis completos depois de `start` (o dia de início não conta), como no bot. */
export function businessDaysBetween(start: Date, end: Date): number {
  let days = 0;
  const p = brtParts(start);
  // meia-noite de Brasília do dia seguinte
  let cursor = Date.UTC(p.year, p.month - 1, p.day + 1, 3, 0, 0);
  while (cursor < end.getTime()) {
    const wd = brtParts(new Date(cursor)).weekday;
    if (wd >= 1 && wd <= 5) days += 1;
    cursor += 24 * 60 * 60 * 1000;
  }
  return days;
}

/** 10h de Brasília do próximo dia útil depois de `after`. */
export function next10amBusinessDay(after: Date): Date {
  const p = brtParts(after);
  for (let i = 1; i <= 10; i++) {
    const candidate = new Date(Date.UTC(p.year, p.month - 1, p.day + i, 13, 0, 0));
    const wd = brtParts(candidate).weekday;
    if (wd >= 1 && wd <= 5) return candidate;
  }
  return new Date(after.getTime() + 24 * 60 * 60 * 1000);
}

/** Área responsável: quem foi marcado por último, senão a tag de pessoa, senão a tag de área. */
export function caseArea(
  c: Pick<Case, "person_tags" | "area_tags">,
  messages: Message[] = [],
  waitingFor?: WaitingFor | null,
): Area | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = messages[i].content || "";
    for (const area of Object.keys(ROLE_IDS) as Area[]) {
      if (text.includes(`<@&${ROLE_IDS[area]}>`)) return area;
    }
  }
  if (waitingFor === "team_n2") return "n2";
  if (waitingFor === "team_chatbot") return "chatbot";
  if (waitingFor === "team_am") return "am";
  for (const t of c.person_tags) {
    const a = PERSON_TAG_AREA[t.toLowerCase()];
    if (a) return a;
  }
  for (const t of c.area_tags) {
    const a = AREA_TAG_AREA[t.toLowerCase()];
    if (a) return a;
  }
  return null;
}

function isTeam(m: Message) {
  return isResolutive(lookupMember(m.author_username).area);
}

/** Última mensagem de quem pediu ajuda (fora do time e fora de bots). */
export function lastRequesterMessage(messages: Message[]): Message | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.is_bot) continue;
    if (!isTeam(m)) return m;
  }
  return null;
}

/** O time já respondeu algo útil (15+ caracteres) depois da última mensagem de quem pediu? */
export function teamAnsweredAfter(messages: Message[], since: Message | null): boolean {
  if (!since) return true;
  const t = new Date(since.sent_at).getTime();
  return messages.some(
    (m) =>
      !m.is_bot &&
      isTeam(m) &&
      new Date(m.sent_at).getTime() > t &&
      (m.content || "").trim().length >= 15,
  );
}

export type Waiting = {
  /** Com quem está a bola agora. */
  on: "team" | "client" | "none";
  area: Area | null;
  since: Date | null;
  minutes: number;
  businessDays: number;
  /** Rótulo do prazo ("4 h", "10h de amanhã"…). */
  slaLabel: string;
  /** Quanto do SLA já foi usado, em %. 100+ = fora do SLA. */
  usedPct: number;
};

/** Situação de um caso aberto: quem deve agir, há quanto tempo e quanto do SLA já foi. */
export function waitingInfo(
  c: Case,
  messages: Message[],
  waitingFor: WaitingFor | null | undefined,
  now = new Date(),
): Waiting {
  const area = caseArea(c, messages, waitingFor);
  const last = lastRequesterMessage(messages);
  const answered = teamAnsweredAfter(messages, last);
  // A leitura da IA manda; sem análise, vale quem falou por último
  let on: Waiting["on"];
  if (waitingFor === "client") on = "client";
  else if (waitingFor === "none") on = "none";
  else if (waitingFor) on = "team";
  else on = answered ? "client" : "team";
  const since = last ? new Date(last.sent_at) : new Date(c.opened_at);
  const minutes = businessMinutesBetween(since, now);
  const businessDays = businessDaysBetween(since, now);

  let slaLabel = "—";
  let usedPct = 0;
  if (area === "chatbot") {
    const due = next10amBusinessDay(since);
    const dueP = brtParts(due);
    const nowP = brtParts(now);
    slaLabel =
      dueP.day === nowP.day && dueP.month === nowP.month
        ? "10h de hoje"
        : `10h de ${String(dueP.day).padStart(2, "0")}/${String(dueP.month).padStart(2, "0")}`;
    const total = Math.max(1, businessMinutesBetween(since, due));
    usedPct = Math.round((minutes / total) * 100);
    if (now >= due) usedPct = Math.max(usedPct, 100);
  } else {
    const target = area === "am" ? SLA_AM : (SLA_N2[(c.priority || "P2") as Priority] ?? SLA_N2.P2);
    slaLabel = fmtMinutes(target);
    usedPct = Math.round((minutes / target) * 100);
  }
  return { on, area, since, minutes, businessDays, slaLabel, usedPct };
}

/** 1ª resposta dentro do SLA? null = não dá para medir. */
export function firstResponseWithinSla(
  c: Case,
  area: Area | null,
  firstResponseMinutes: number | null,
): boolean | null {
  if (firstResponseMinutes == null || !area) return null;
  if (area === "chatbot") {
    const opened = new Date(c.opened_at);
    return firstResponseMinutes <= businessMinutesBetween(opened, next10amBusinessDay(opened));
  }
  const target = area === "am" ? SLA_AM : (SLA_N2[(c.priority || "P2") as Priority] ?? SLA_N2.P2);
  return firstResponseMinutes <= target;
}

export function fmtMinutes(min: number): string {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h < 24) return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "1 dia" : `${d} dias`;
}

/** "há 41 min", "há 2 dias úteis". */
export function fmtWaiting(w: Pick<Waiting, "minutes" | "businessDays">): string {
  if (w.businessDays >= 1)
    return w.businessDays === 1 ? "há 1 dia útil" : `há ${w.businessDays} dias úteis`;
  return `há ${fmtMinutes(w.minutes)}`;
}

// ─── Períodos (sempre em horário de Brasília) ────────────────────────────────

/** Início do dia em Brasília (como Date UTC). */
export function brtDayStart(date: Date): Date {
  const p = brtParts(date);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, 3, 0, 0));
}

/** Segunda-feira 00h da semana de `date`, em Brasília. */
export function brtWeekStart(date: Date): Date {
  const start = brtDayStart(date);
  const wd = brtParts(date).weekday;
  const back = (wd + 6) % 7;
  return new Date(start.getTime() - back * 24 * 60 * 60 * 1000);
}

/** Primeiro dia do mês em Brasília. */
export function brtMonthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1, 3, 0, 0));
}

/** Chave ISO da semana ("2026-W43") de uma segunda-feira. */
export function isoWeekKey(monday: Date): string {
  const p = brtParts(monday);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const thursday = new Date(d.getTime() + 3 * 24 * 60 * 60 * 1000);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((thursday.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const DATE_FMT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
});
const DATETIME_FMT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const TIME_FMT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

export const fmtDay = (iso: string | Date) => DATE_FMT.format(new Date(iso));
export const fmtDateTime = (iso: string | Date) => DATETIME_FMT.format(new Date(iso));

/** "hoje 9h02", "ontem 16h20", "14/10 10h05". */
export function fmtWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const time = TIME_FMT.format(d).replace(":", "h");
  const day = brtDayStart(d).getTime();
  const today = brtDayStart(now).getTime();
  if (day === today) return `hoje ${time}`;
  if (day === today - 86_400_000) return `ontem ${time}`;
  return `${fmtDay(d)} ${time}`;
}

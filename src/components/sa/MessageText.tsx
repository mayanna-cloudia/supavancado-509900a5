import type { ReactNode } from "react";

// Cargos do Discord mencionados nos tópicos (mesmos ids do bot)
const ROLE_NAMES: Record<string, string> = {
  "1418600381885186268": "N2",
  "801052794143637504": "Chatbot",
  "801052551554400276": "AM",
};

/** Texto curto para um link: mensagens do Discord viram "mensagem no Discord", o resto vira domínio + caminho. */
function linkLabel(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith("discord.com") && u.pathname.startsWith("/channels/")) {
      return u.pathname.split("/").length > 4 ? "mensagem no Discord" : "tópico no Discord";
    }
    const path = u.pathname === "/" ? "" : u.pathname;
    const text = u.hostname.replace(/^www\./, "") + path;
    return text.length > 48 ? `${text.slice(0, 45)}…` : text;
  } catch {
    return url.length > 48 ? `${url.slice(0, 45)}…` : url;
  }
}

// Menções, links, negrito e código, na ordem em que aparecem
const TOKEN =
  /<@!?(\d+)>|<@&(\d+)>|<#(\d+)>|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|\*\*([^*]+)\*\*|`([^`]+)`/g;

function inline(text: string, names: Map<string, string>, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const k = `${key}-${i++}`;
    if (m[1])
      out.push(
        <span key={k} className="rounded bg-brand-soft px-1 font-medium text-brand-text">
          @{names.get(m[1]) ?? "alguém"}
        </span>,
      );
    else if (m[2])
      out.push(
        <span key={k} className="rounded bg-brand-soft px-1 font-medium text-brand-text">
          @{ROLE_NAMES[m[2]] ?? "cargo"}
        </span>,
      );
    else if (m[3])
      out.push(
        <span key={k} className="font-medium text-brand-text">
          #canal
        </span>,
      );
    else if (m[4])
      out.push(
        <a
          key={k}
          href={m[4]}
          target="_blank"
          rel="noreferrer"
          title={m[4]}
          className="font-medium"
        >
          {linkLabel(m[4])}
        </a>,
      );
    else if (m[5]) out.push(<b key={k}>{m[5]}</b>);
    else if (m[6])
      out.push(
        <code key={k} className="rounded bg-hover px-1 text-[0.92em]">
          {m[6]}
        </code>,
      );
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Texto de uma mensagem do Discord, legível e sem estourar a largura. */
export function MessageText({ text, names }: { text: string; names: Map<string, string> }) {
  // Agrupa linhas seguidas de citação ("> ") num bloco só
  const blocks: { quote: boolean; lines: string[] }[] = [];
  for (const line of text.split("\n")) {
    const quote = /^>\s?/.test(line);
    const clean = quote ? line.replace(/^>\s?/, "") : line;
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock && lastBlock.quote === quote) lastBlock.lines.push(clean);
    else blocks.push({ quote, lines: [clean] });
  }
  return (
    <>
      {blocks.map((b, bi) => {
        const body = b.lines.map((l, li) => (
          <span key={li}>
            {li > 0 && <br />}
            {inline(l, names, `${bi}-${li}`)}
          </span>
        ));
        return b.quote ? (
          <div key={bi} className="my-1 border-l-[3px] border-border pl-2.5 text-muted-foreground">
            {body}
          </div>
        ) : (
          <div key={bi}>{body}</div>
        );
      })}
    </>
  );
}

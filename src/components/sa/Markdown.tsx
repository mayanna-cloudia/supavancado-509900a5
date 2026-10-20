import type { ReactNode } from "react";

/** Negrito e itálico dentro de uma linha. Monta nós React (nada de HTML cru vindo da IA). */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      m[1] != null ? (
        <b key={`${keyBase}-${i++}`}>{m[1]}</b>
      ) : (
        <i key={`${keyBase}-${i++}`}>{m[2]}</i>
      ),
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

/** Markdown do boletim semanal: títulos, listas, tabelas, separadores e parágrafos. */
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/```[a-z]*\n?/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t) {
      i++;
      continue;
    }
    const key = `b${k++}`;
    const h = /^(#{1,4})\s+(.*)$/.exec(t);
    if (h) {
      const level = h[1].length;
      const cls =
        level === 1
          ? "text-xl font-bold mt-1"
          : level === 2
            ? "text-base font-bold mt-3"
            : "text-[15px] font-bold mt-2";
      blocks.push(
        <div key={key} className={cls}>
          {inline(h[2], key)}
        </div>,
      );
      i++;
    } else if (/^(-{3,}|\*{3,})$/.test(t)) {
      blocks.push(<hr key={key} className="my-1 border-line" />);
      i++;
    } else if (t.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const r = cells(lines[i]);
        if (!r.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(r);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={key} className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13.5px]">
            <thead>
              <tr className="text-left text-[12.5px] text-muted-foreground">
                {head?.map((c, j) => (
                  <th key={j} className="px-2.5 py-2 font-medium">
                    {inline(c, `${key}h${j}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri} className="border-t border-line align-top">
                  {r.map((c, j) => (
                    <td key={j} className="px-2.5 py-2">
                      {inline(c, `${key}${ri}-${j}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else if (/^([*-]|\d+\.)\s+/.test(t)) {
      const ordered = /^\d+\./.test(t);
      const items: string[] = [];
      while (i < lines.length && /^\s*([*-]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].trim().replace(/^([*-]|\d+\.)\s+/, ""));
        i++;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List
          key={key}
          className={`m-0 flex flex-col gap-1 pl-5 ${ordered ? "list-decimal" : "list-disc"}`}
        >
          {items.map((it, j) => (
            <li key={j}>{inline(it, `${key}${j}`)}</li>
          ))}
        </List>,
      );
    } else {
      const para: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^(#{1,4}\s|\||([*-]|\d+\.)\s|-{3,})/.test(lines[i].trim())
      ) {
        para.push(lines[i].trim());
        i++;
      }
      blocks.push(
        <p key={key} className="m-0">
          {inline(para.join(" "), key)}
        </p>,
      );
    }
  }
  return <div className="flex flex-col gap-2.5 leading-relaxed">{blocks}</div>;
}

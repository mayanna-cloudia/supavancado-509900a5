// Links do painel antigo (uma página só, com abas) continuam funcionando:
// a página inicial reconhece os parâmetros antigos e manda para a tela nova já filtrada.
//   ?idclinic=372                         → Casos da clínica 372
//   ?idclinic=372&priority=P1&status=open → Casos: 372, P1, abertos
//   ?tab=sla&area=SuporteN2               → Hoje, na fila do N2
//   ?q=login (ou ?search=login)           → Casos buscando "login"
// Parâmetros: idclinic, priority (all/P1/P2/P3), status (all/open/resolved),
// area (all/SuporteN2/Chatbot/AM/unassigned), category, q|search,
// tab (overview/cases/sla/team/metrics).

export type LegacyTarget =
  | { to: "/casos"; search: Record<string, string> }
  | { to: "/"; search: { fila: string } }
  | { to: "/coordenacao" | "/problemas"; search: Record<string, never> };

const LEGACY_KEYS = ["idclinic", "priority", "status", "area", "category", "q", "search", "tab"];

const str = (v: unknown): string | undefined => {
  if (typeof v === "number") return String(v);
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
};

/** Para onde um link antigo deve ir; null quando não é um link antigo. */
export function legacyTarget(raw: Record<string, unknown>): LegacyTarget | null {
  if (!LEGACY_KEYS.some((k) => raw[k] != null && raw[k] !== "")) return null;

  const tab = str(raw.tab)?.toLowerCase();
  const area = str(raw.area);
  const fila =
    area === "SuporteN2" ? "n2" : area === "Chatbot" ? "chatbot" : area === "AM" ? "am" : undefined;

  if (tab === "sla") return { to: "/", search: { fila: fila ?? "todos" } };
  if (tab === "team") return { to: "/coordenacao", search: {} };
  if (tab === "metrics") return { to: "/problemas", search: {} };

  const search: Record<string, string> = {};
  const idclinic = str(raw.idclinic);
  if (idclinic) search.idclinic = idclinic;
  const priority = str(raw.priority)?.toUpperCase();
  if (priority === "P1" || priority === "P2" || priority === "P3") search.prioridade = priority;
  const status = str(raw.status)?.toLowerCase();
  if (status === "all") search.status = "todos";
  else if (status === "resolved") search.status = "resolvidos";
  // open = abertos, que já é o padrão de Casos
  const areaMap: Record<string, string> = {
    SuporteN2: "N2",
    Chatbot: "Chatbot",
    AM: "AM",
    unassigned: "sem",
  };
  if (area && areaMap[area]) search.area = areaMap[area];
  const category = str(raw.category);
  if (category && category.toLowerCase() !== "all") search.categoria = category;
  const q = str(raw.q) ?? str(raw.search);
  if (q) search.q = q;

  // tab=overview sem filtro nenhum é a própria página inicial
  if (tab === "overview" && !Object.keys(search).length) return null;
  return { to: "/casos", search };
}

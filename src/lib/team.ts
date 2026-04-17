// Mapping Discord username -> { real name, area }
// Areas: SuporteN2, Chatbot, AM, QA, CEO, PosVenda
// Only SuporteN2, Chatbot and AM are resolutive.

export type Area = "SuporteN2" | "Chatbot" | "AM" | "QA" | "CEO" | "PosVenda";

export const RESOLUTIVE_AREAS: Area[] = ["SuporteN2", "Chatbot", "AM"];

export const AREA_LABEL: Record<Area, string> = {
  SuporteN2: "Suporte N2",
  Chatbot: "Chatbot",
  AM: "AM",
  QA: "QA",
  CEO: "CEO",
  PosVenda: "Pós-Venda",
};

// Tailwind class fragments per area (background + text + border)
export const AREA_BADGE: Record<Area, string> = {
  SuporteN2: "bg-[oklch(0.78_0.14_230/0.15)] text-[oklch(0.85_0.14_230)] border-[oklch(0.78_0.14_230/0.4)]",
  Chatbot:   "bg-[oklch(0.65_0.22_295/0.15)] text-[oklch(0.78_0.18_295)] border-[oklch(0.65_0.22_295/0.4)]",
  AM:        "bg-[oklch(0.72_0.17_162/0.15)] text-[oklch(0.82_0.17_162)] border-[oklch(0.72_0.17_162/0.4)]",
  QA:        "bg-[oklch(0.80_0.16_80/0.15)]  text-[oklch(0.88_0.16_80)]  border-[oklch(0.80_0.16_80/0.4)]",
  CEO:       "bg-[oklch(0.74_0.18_47/0.15)]  text-[oklch(0.84_0.18_47)]  border-[oklch(0.74_0.18_47/0.4)]",
  PosVenda:  "bg-[oklch(0.55_0.03_260/0.2)]  text-[oklch(0.78_0.02_260)] border-[oklch(0.55_0.03_260/0.4)]",
};

export const AREA_COLOR_HEX: Record<Area, string> = {
  SuporteN2: "#38bdf8",
  Chatbot:   "#8b5cf6",
  AM:        "#10b981",
  QA:        "#f59e0b",
  CEO:       "#f97316",
  PosVenda:  "#64748b",
};

const RAW: Record<Area, Record<string, string>> = {
  SuporteN2: {
    mayanna: "Mayanna",
    gabrielaugusto_cloudia: "Gabriel Augusto",
  },
  Chatbot: {
    leandcesar: "Leandro César",
    _mateusbrito: "Mateus Brito",
    brunoalves1867: "Bruno Alves",
    edumpda: "Eduardo Marques",
    gabrielabispo: "Gabriela Bispo",
    mumu0227: "Murilo",
  },
  AM: {
    bernardi_cloudia: "Matheus Bernardi",
    robertsantosdev: "Robert Santos",
    luansdev: "Luan",
    "hudson.arr_18116": "Hudson Arruda",
  },
  QA: {
    felipedubow: "Felipe Dubow",
  },
  CEO: {
    tiagomiranda6025: "Tiago Miranda",
    felipemirandacosta: "Felipe Miranda Costa",
  },
  PosVenda: {
    albertoalcantara: "Alberto Alcantara",
    hil4rys: "Hílary",
    mrcoliver: "Marcos Oliveira",
    brunaperas: "Bruna Pereira",
    deboraviega_67584: "Debora Viega",
    dicksongrael_67476: "Dickson Grael",
    gabscloudia: "Gabi Rios",
    giullianadias_33818: "Giulliana Dias",
    henriquecleite: "Henrique Campos",
    igorhenrique0949: "Igor Henrique",
    joice7066: "Joice",
    pedrodiogenes0064: "Pedro Diógenes",
    ramon_carvalho: "Ramon Carvalho",
  },
};

const USER_INDEX: Record<string, { name: string; area: Area }> = {};
for (const area of Object.keys(RAW) as Area[]) {
  for (const [username, name] of Object.entries(RAW[area])) {
    USER_INDEX[username.toLowerCase()] = { name, area };
  }
}

export function lookupMember(username: string | null | undefined): { name: string; area: Area | null } {
  if (!username) return { name: "Desconhecido", area: null };
  const key = username.toLowerCase().trim();
  const hit = USER_INDEX[key];
  if (hit) return hit;
  // Fallback - prettify username
  const pretty = key.replace(/[._-]+/g, " ").replace(/\d+/g, "").trim();
  return { name: pretty ? pretty.replace(/\b\w/g, (c) => c.toUpperCase()) : username, area: null };
}

export function isResolutive(area: Area | null | undefined): boolean {
  return !!area && RESOLUTIVE_AREAS.includes(area);
}

export const ALL_AREAS: Area[] = ["SuporteN2", "Chatbot", "AM", "QA", "CEO", "PosVenda"];

// Resolver team string from analyses table -> Area enum (best effort)
export function normalizeResolverTeam(team: string | null | undefined): Area | null {
  if (!team) return null;
  const t = team.toLowerCase().replace(/\s|_|-/g, "");
  if (t.includes("n2") || t.includes("suporte")) return "SuporteN2";
  if (t.includes("chatbot") || t.includes("bot")) return "Chatbot";
  if (t === "am" || t.includes("accountmanager") || t.startsWith("am")) return "AM";
  if (t.includes("qa")) return "QA";
  if (t.includes("ceo")) return "CEO";
  if (t.includes("posvenda") || t.includes("pos") || t.includes("cs")) return "PosVenda";
  return null;
}

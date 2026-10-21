import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  List,
  Repeat,
  Users,
  SlidersHorizontal,
  Lock,
  Moon,
  Sun,
  PanelLeft,
  Search,
  LogOut,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useMenuCollapsed, useMounted, useTheme, useWho } from "@/lib/prefs";
import { PANEL_PEOPLE } from "@/lib/team";
import { brtParts } from "@/lib/sla";
import { JobBanner } from "./JobBanner";
import { signOut } from "@/lib/auth";

type NavItem = { to: string; label: string; icon: typeof Home; restricted?: boolean };

const NAV_TIME: NavItem[] = [
  { to: "/", label: "Hoje", icon: Home },
  { to: "/casos", label: "Casos", icon: List },
  { to: "/problemas", label: "Problemas que voltam", icon: Repeat },
];
const NAV_RESTRITO: NavItem[] = [
  { to: "/coordenacao", label: "Coordenação", icon: Users, restricted: true },
  { to: "/admin", label: "Admin", icon: SlidersHorizontal, restricted: true },
];

const WEEKDAY = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MONTH = [
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

function greeting(hour: number) {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export function AppShell({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  const { collapsed, toggle: toggleMenu } = useMenuCollapsed();
  const { dark, toggle: toggleTheme } = useTheme();
  const { person, setWho } = useWho();
  const [picker, setPicker] = useState(false);
  const mounted = useMounted();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const open = !collapsed;

  const now = brtParts(new Date());
  const dateLine = mounted ? `${WEEKDAY[now.weekday]}, ${now.day} de ${MONTH[now.month - 1]}` : " ";
  const hello = mounted ? greeting(now.hour) : "Olá";
  const initials = person
    ? person.name
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";

  const renderItem = (item: NavItem) => {
    const active = item.to === "/" ? path === "/" : path.startsWith(item.to);
    const Icon = item.icon;
    return (
      <Link
        key={item.to}
        to={item.to}
        title={item.label}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        className={[
          "flex h-11 items-center gap-2.5 rounded-lg no-underline transition-colors",
          open ? "px-3" : "justify-center",
          active
            ? "bg-brand-soft font-medium text-brand-text shadow-[inset_3px_0_0_var(--brand)]"
            : "text-foreground hover:bg-hover hover:text-foreground",
        ].join(" ")}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} aria-hidden />
        {open && <span className="flex-1 truncate">{item.label}</span>}
        {open && item.restricted && (
          <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Restrito" />
        )}
      </Link>
    );
  };

  return (
    <div className="flex min-h-screen flex-wrap bg-surface text-foreground">
      <aside
        className={[
          "flex min-w-0 flex-col gap-1 bg-surface p-3",
          open ? "flex-[1_1_248px] md:max-w-[272px]" : "flex-[0_0_76px]",
        ].join(" ")}
      >
        <div className="flex items-center px-2 pb-4 pt-2">
          <div className="overflow-hidden" style={{ width: open ? 131 : 41 }}>
            <img
              src={dark ? "/cloudia-logo-dark.png" : "/cloudia-logo-light.png"}
              alt="Cloudia"
              className="block h-[30px] w-auto max-w-none"
            />
          </div>
        </div>

        {open && (
          <div className="px-3 py-1 text-[11px] font-bold tracking-[0.08em] text-muted-foreground">
            TIME
          </div>
        )}
        {NAV_TIME.map(renderItem)}
        <div className="mx-2 my-2.5 h-px bg-line" />
        {open && (
          <div className="px-3 py-1 text-[11px] font-bold tracking-[0.08em] text-muted-foreground">
            ACESSO RESTRITO
          </div>
        )}
        {NAV_RESTRITO.map(renderItem)}

        <div className="min-h-6 flex-1" />
        <button
          type="button"
          onClick={toggleTheme}
          title={dark ? "Modo claro" : "Modo escuro"}
          aria-label={dark ? "Modo claro" : "Modo escuro"}
          className={[
            "flex h-11 items-center gap-2.5 rounded-lg border border-border bg-card text-foreground",
            open ? "px-3" : "justify-center",
          ].join(" ")}
        >
          {dark ? (
            <Sun className="h-[18px] w-[18px]" strokeWidth={1.8} />
          ) : (
            <Moon className="h-[18px] w-[18px]" strokeWidth={1.8} />
          )}
          {open && <span>{dark ? "Modo claro" : "Modo escuro"}</span>}
        </button>
        <div
          className={[
            "flex items-center gap-2.5 px-1.5 pb-1 pt-2.5",
            open ? "" : "justify-center",
          ].join(" ")}
        >
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#0e7c6b] text-[13px] font-bold text-white">
            {mounted ? initials : "?"}
          </div>
          {open && (
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-bold">
                {mounted ? (person?.name ?? "Visitante") : " "}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {mounted ? (person?.area ?? "nome não escolhido") : " "}
              </span>
            </div>
          )}
          {open && (
            <button
              type="button"
              onClick={() => signOut()}
              title="Sair da conta Google"
              aria-label="Sair da conta Google"
              className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-hover hover:text-foreground"
            >
              <LogOut className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </button>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-[999_1_560px] flex-col">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 py-3 pl-4 pr-7">
          <button
            type="button"
            onClick={toggleMenu}
            title={open ? "Recolher menu" : "Expandir menu"}
            aria-label={open ? "Recolher menu" : "Expandir menu"}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground"
          >
            <PanelLeft className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </button>
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">{dateLine}</div>
            <div className="text-lg">
              {hello}
              {mounted && person ? (
                <>
                  , <b>{person.name}</b>
                </>
              ) : (
                "!"
              )}{" "}
              <button
                type="button"
                onClick={() => setPicker((p) => !p)}
                className="px-1 text-xs text-brand-text underline"
              >
                {mounted && person ? "não é você?" : "quem é você?"}
              </button>
            </div>
          </div>
          {actions}
        </div>

        {picker && (
          <div className="card mb-3 ml-4 mr-7 flex flex-col gap-2.5 px-4 py-3.5">
            <div>
              <div className="font-bold">Quem está acessando?</div>
              <div className="text-[13px] text-muted-foreground">
                Escolha seu nome uma vez. Fica lembrado neste navegador, sem cadastro e sem senha.
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PANEL_PEOPLE.map((p) => {
                const on = p.name === person?.name;
                return (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => {
                      setWho(p.name);
                      setPicker(false);
                    }}
                    className={[
                      "min-h-9 rounded-full border px-3 text-[13px]",
                      on ? "border-brand bg-brand-soft text-brand-text" : "border-border bg-card",
                    ].join(" ")}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <main className="flex flex-1 flex-col gap-5 rounded-tl-2xl border-l border-t border-line bg-background px-7 pb-12 pt-6">
          <JobBanner />
          {children}
        </main>
      </div>
    </div>
  );
}

/** Busca global do topo: leva para Casos já filtrado. */
export function TopSearch() {
  const [q, setQ] = useState("");
  return (
    <form action="/casos" method="get" className="flex flex-[0_1_360px] items-center">
      <label htmlFor="busca-global" className="sr-only">
        Buscar
      </label>
      <div className="relative w-full">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id="busca-global"
          name="q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar caso, clínica ou mensagem"
          className="h-10 w-full rounded-full border border-border bg-card pl-9 pr-4 text-foreground"
        />
      </div>
    </form>
  );
}

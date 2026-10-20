// Preferências de quem está usando o painel, guardadas só neste navegador.
// Sem cadastro e sem senha: é só para a saudação, a aba "Com a minha tag" e o tema.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { PANEL_PEOPLE } from "./team";

const KEYS = { who: "sa2_who", theme: "sa2_theme", collapsed: "sa2_menu_collapsed" } as const;
const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* navegador sem storage: a preferência vale só nesta aba */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key?.startsWith("sa2_") && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function usePref(key: string): [string | null, (v: string | null) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const set = useCallback((v: string | null) => write(key, v), [key]);
  return [value, set];
}

/** Quem está acessando (escolhido uma vez no "quem é você?"). */
export function useWho() {
  const [name, setName] = usePref(KEYS.who);
  const person = PANEL_PEOPLE.find((p) => p.name === name) ?? null;
  return { person, setWho: setName };
}

export function useTheme() {
  const [theme, setTheme] = usePref(KEYS.theme);
  const dark = theme === "dark";
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  return { dark, toggle: () => setTheme(dark ? "light" : "dark") };
}

export function useMenuCollapsed() {
  const [v, set] = usePref(KEYS.collapsed);
  return { collapsed: v === "1", toggle: () => set(v === "1" ? null : "1") };
}

/** Evita diferença entre o HTML do servidor e o do navegador em coisas que dependem do relógio. */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

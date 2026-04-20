import { format } from "date-fns";
import { useEffect, useState } from "react";

export function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="text-right">
      <div className="text-sm font-medium text-foreground tabular-nums leading-none">
        {format(now, "HH:mm:ss")}
      </div>
      <div className="text-[10px] text-muted-foreground hidden sm:block mt-1 tabular-nums uppercase tracking-wider">
        {format(now, "EEE, dd MMM yyyy")}
      </div>
    </div>
  );
}

export function LiveIndicator({ active }: { active: boolean; lastEvent: number }) {
  return (
    <div
      className="flex items-center gap-2 rounded-full px-3 py-[5px]"
      style={{
        background: active
          ? "color-mix(in oklab, var(--brand-green) 10%, transparent)"
          : "color-mix(in oklab, var(--muted-foreground) 12%, transparent)",
        border: active
          ? "1px solid color-mix(in oklab, var(--brand-green) 30%, transparent)"
          : "1px solid var(--border)",
      }}
    >
      <span className="relative flex h-2 w-2">
        <span
          className={
            active
              ? "pulse-dot absolute inline-flex h-full w-full rounded-full bg-[var(--brand-green)]"
              : "absolute inline-flex h-full w-full rounded-full bg-muted-foreground"
          }
        />
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${active ? "bg-[var(--brand-green)]" : "bg-muted-foreground"}`}
        />
      </span>
      <span className="text-[11px] font-medium text-foreground/90 hidden xs:inline">
        {active ? "Tempo real" : "Conectando…"}
      </span>
    </div>
  );
}

export function Header({ live, lastEvent }: { live: boolean; lastEvent: number }) {
  return (
    <header
      className="sticky top-0 z-30 border-b border-border"
      style={{
        background: "color-mix(in oklab, var(--background) 75%, transparent)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-3 sm:gap-6 sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src="https://i.imgur.com/1jQuRAK.png"
            alt="Cloudia"
            style={{ height: 28, width: "auto" }}
            className="shrink-0"
          />
          <div className="min-w-0 hidden sm:block">
            <h1 className="font-display text-[15px] font-semibold leading-tight text-foreground">
              Suporte Avançado
            </h1>
            <p className="text-[10px] text-muted-foreground tracking-wide mt-0.5">
              Operação técnica · powered by IA
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          <LiveIndicator active={live} lastEvent={lastEvent} />
          <LiveClock />
        </div>
      </div>
    </header>
  );
}

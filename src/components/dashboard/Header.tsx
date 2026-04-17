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
      <div className="text-sm font-medium text-foreground tabular-nums">
        {format(now, "HH:mm:ss")}
      </div>
      <div className="text-xs text-muted-foreground">{format(now, "EEE, dd MMM yyyy")}</div>
    </div>
  );
}

export function LiveIndicator({ active, lastEvent }: { active: boolean; lastEvent: number }) {
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (!lastEvent) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 1200);
    return () => clearTimeout(t);
  }, [lastEvent]);

  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5">
      <span className="relative flex h-2.5 w-2.5">
        <span
          className={
            active
              ? "pulse-dot absolute inline-flex h-full w-full rounded-full bg-[var(--brand-green)]"
              : "absolute inline-flex h-full w-full rounded-full bg-muted-foreground"
          }
        />
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${active ? "bg-[var(--brand-green)]" : "bg-muted-foreground"}`}
        />
      </span>
      <span className="text-xs font-medium text-foreground/90">
        {active ? "Tempo real" : "Conectando…"}
      </span>
      {pulse && (
        <span className="text-[10px] text-[var(--brand-green)] animate-pulse">● novo evento</span>
      )}
    </div>
  );
}

export function Header({ live, lastEvent }: { live: boolean; lastEvent: number }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-6 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--brand-blue)] to-[var(--brand-purple)] shadow-lg shadow-[var(--brand-blue)]/20">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-background">
              <path d="M3 12c2-3 5-5 9-5s7 2 9 5c-2 3-5 5-9 5s-7-2-9-5z" stroke="currentColor" strokeWidth="2"/>
              <circle cx="12" cy="12" r="2.5" fill="currentColor"/>
            </svg>
          </div>
          <div>
            <h1 className="font-display text-lg font-semibold leading-tight">
              Cloudia <span className="text-muted-foreground font-normal">·</span>{" "}
              <span className="text-[var(--brand-blue)]">Suporte Avançado</span>
            </h1>
            <p className="text-xs text-muted-foreground">Operação técnica · powered by IA</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <LiveIndicator active={live} lastEvent={lastEvent} />
          <LiveClock />
        </div>
      </div>
    </header>
  );
}

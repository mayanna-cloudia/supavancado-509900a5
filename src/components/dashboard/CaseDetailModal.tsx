import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, X } from "lucide-react";
import type { CaseRow, Message } from "@/lib/supabase";
import { ANALYZE_FN_URL, SUPABASE_ANON } from "@/lib/supabase";
import { fmtDate, fmtDuration, priorityBadgeClass, diffMinutes } from "@/lib/format";
import { lookupMember, AREA_BADGE, AREA_LABEL, type Area } from "@/lib/team";
import { cn } from "@/lib/utils";

export function CaseDetailModal({
  row, messages, onClose, onReanalyzed,
}: {
  row: CaseRow | null;
  messages: Message[];
  onClose: () => void;
  onReanalyzed?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [reanalyzeMsg, setReanalyzeMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const participants = useMemo(() => {
    if (!row) return [];
    const map = new Map<string, { name: string; area: Area | null; count: number }>();
    for (const m of messages) {
      const key = (m.author_username || "").toLowerCase();
      if (!key) continue;
      const info = lookupMember(m.author_username);
      const prev = map.get(key);
      if (prev) prev.count++;
      else map.set(key, { ...info, count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [messages, row]);

  const meta = useMemo(() => {
    if (!row) return null;
    const opener = messages[0];
    const openerInfo = opener ? lookupMember(opener.author_username) : null;
    const reply = opener ? messages.find((m) => m.author_username !== opener.author_username) : null;
    const firstResp = opener && reply ? diffMinutes(row.opened_at, reply.sent_at) : null;
    const duration = row.closed_at ? diffMinutes(row.opened_at, row.closed_at) : diffMinutes(row.opened_at, row.last_activity_at || new Date().toISOString());
    return { openerInfo, firstResp, duration, count: messages.length };
  }, [row, messages]);

  if (!row) return null;
  const a = row.analysis;
  const resolved = !!a?.resolved;
  const resolverInfo = a?.resolver_name ? lookupMember(a.resolver_name) : null;

  const reanalyze = async () => {
    setBusy(true);
    setReanalyzeMsg(null);
    try {
      const res = await fetch(ANALYZE_FN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_ANON}`,
        },
        body: JSON.stringify({ case_id: row.id }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${txt.slice(0, 120)}`);
      }
      setReanalyzeMsg({ kind: "ok", text: "Reanálise iniciada. A nova análise aparecerá em instantes." });
      onReanalyzed?.();
    } catch (e: unknown) {
      setReanalyzeMsg({
        kind: "err",
        text: e instanceof Error ? e.message : "Falha ao reanalisar caso",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto scrollbar-thin bg-card border-border p-0">
        <DialogHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="px-2 py-0.5 rounded-md bg-surface border border-border font-mono text-xs text-foreground/90">
                  IDCLINIC: {row.idclinic || "—"}
                </span>
                {a?.priority && (
                  <span className={cn("px-2 py-0.5 rounded-md text-xs font-semibold border", priorityBadgeClass(a.priority))}>
                    {a.priority.toUpperCase()}
                  </span>
                )}
                {a?.category && (
                  <span className="px-2 py-0.5 rounded-md text-xs bg-[var(--brand-blue)]/15 border border-[var(--brand-blue)]/40 text-[var(--brand-blue)]">
                    {a.category}
                  </span>
                )}
                {a?.subcategory && (
                  <span className="px-2 py-0.5 rounded-md text-xs bg-[var(--brand-purple)]/15 border border-[var(--brand-purple)]/40 text-[var(--brand-purple)]">
                    {a.subcategory}
                  </span>
                )}
                <span className={cn(
                  "px-2 py-0.5 rounded-md text-xs font-semibold border",
                  resolved
                    ? "bg-[var(--brand-green)]/15 text-[var(--brand-green)] border-[var(--brand-green)]/40"
                    : "bg-[var(--brand-orange)]/15 text-[var(--brand-orange)] border-[var(--brand-orange)]/40"
                )}>
                  {resolved ? "Resolvido" : "Em aberto"}
                </span>
              </div>
              <DialogTitle className="font-display text-lg pr-6 leading-tight">
                {row.thread_title || "(sem título)"}
              </DialogTitle>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:bg-surface hover:text-foreground"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5">
          {/* Metadata grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <MetaItem label="Data abertura" value={fmtDate(row.opened_at)} />
            <MetaItem label="Duração" value={fmtDuration(meta?.duration ?? null)} />
            <MetaItem label="Nº mensagens" value={String(meta?.count ?? 0)} />
            <MetaItem label="1ª resposta" value={fmtDuration(meta?.firstResp ?? null)} />
            <MetaItem label="Aberto por" value={meta?.openerInfo?.name || "—"} />
            <MetaItem label="Resolvido por" value={resolverInfo?.name || "—"} />
          </div>

          {/* Problema */}
          <section>
            <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Problema</h4>
            <div className="rounded-lg border border-border bg-surface/60 p-4 text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
              {a?.summary || <span className="italic text-muted-foreground">Sem análise disponível para este caso.</span>}
            </div>
          </section>

          {/* Resolução */}
          <section>
            <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Resolução</h4>
            <div className={cn(
              "rounded-lg border p-4 text-sm leading-relaxed whitespace-pre-wrap",
              resolved
                ? "bg-[var(--brand-green)]/10 border-[var(--brand-green)]/30 text-foreground/95"
                : "bg-[var(--brand-orange)]/10 border-[var(--brand-orange)]/30 text-foreground/95"
            )}>
              {a?.resolution || <span className="italic text-muted-foreground">{resolved ? "Resolvido sem descrição." : "Caso ainda em andamento."}</span>}
            </div>
          </section>

          {/* Participantes */}
          <section>
            <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Participantes <span className="opacity-60">({participants.length})</span>
            </h4>
            <div className="flex flex-wrap gap-2">
              {participants.length === 0 && <span className="text-xs text-muted-foreground italic">Nenhum participante.</span>}
              {participants.map((p) => (
                <div
                  key={p.name}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs border",
                    p.area
                      ? AREA_BADGE[p.area]
                      : "bg-surface border-border text-foreground/80"
                  )}
                >
                  <span className="font-medium">{p.name}</span>
                  {p.area && <span className="opacity-70">· {AREA_LABEL[p.area]}</span>}
                  <span className="opacity-60 tabular-nums">{p.count}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Reanalisar */}
          <div className="flex items-center justify-between gap-4 pt-2 border-t border-border">
            <div className="text-xs text-muted-foreground">
              {a?.analyzed_at && <>Última análise: {fmtDate(a.analyzed_at)}</>}
            </div>
            <div className="flex flex-col items-end gap-1">
              <Button
                onClick={reanalyze}
                disabled={busy}
                className="bg-gradient-to-r from-[var(--brand-blue)] to-[var(--brand-purple)] text-background hover:opacity-90 border-0"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Reanalisar com IA
              </Button>
              {reanalyzeMsg && (
                <span className={cn(
                  "text-[11px]",
                  reanalyzeMsg.kind === "ok" ? "text-[var(--brand-green)]" : "text-[var(--brand-red)]"
                )}>
                  {reanalyzeMsg.text}
                </span>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium text-foreground truncate" title={value}>{value}</div>
    </div>
  );
}

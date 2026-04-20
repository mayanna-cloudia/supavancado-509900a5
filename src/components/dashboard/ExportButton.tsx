import { Download } from "lucide-react";
import type { CaseRow, Message } from "@/lib/supabase";
import { exportCasesCSV, type ExportScope } from "@/lib/csv";

export function ExportButton({
  rows,
  scope,
  messagesMap,
  className,
}: {
  rows: CaseRow[];
  scope: ExportScope;
  messagesMap?: Record<number, Message[]>;
  className?: string;
}) {
  const handleClick = () => {
    // Build opener lookup from messages map (first message author per case)
    const openerByCaseId: Record<number, string | null> = {};
    if (messagesMap) {
      for (const r of rows) {
        const list = messagesMap[r.id];
        openerByCaseId[r.id] = list && list.length ? list[0].author_username : null;
      }
    }
    exportCasesCSV(rows, scope, { openerByCaseId });
  };

  return (
    <button
      onClick={handleClick}
      className={
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-foreground transition-all duration-200 hover:bg-surface hover:border-[var(--brand-blue)]/60 " +
        (className || "")
      }
    >
      <Download className="h-3.5 w-3.5" />
      Exportar CSV
    </button>
  );
}

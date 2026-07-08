import { createServerFn } from "@tanstack/react-start";

type SupabaseCase = { id: number; thread_id: string | number | null };

export type SyncResult = {
  ok: boolean;
  error?: "not_configured" | "supabase_error";
  message?: string;
  threads_checked: number;
  cases_archived: number;
  errors: number;
};

export const syncDiscordThreads = createServerFn({ method: "POST" }).handler(
  async (): Promise<SyncResult> => {
    const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
    const SUPABASE_URL =
      process.env.SUPABASE_URL || "https://drnxnqguyqndmozmovxu.supabase.co";
    const SERVICE_KEY =
      process.env.SB_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!DISCORD_BOT_TOKEN) {
      return {
        ok: false,
        error: "not_configured",
        message:
          "Sync do Discord ainda não configurado — adicione o secret DISCORD_BOT_TOKEN nas configurações para ativar.",
        threads_checked: 0,
        cases_archived: 0,
        errors: 0,
      };
    }
    if (!SERVICE_KEY) {
      return {
        ok: false,
        error: "not_configured",
        message: "Faltando SB_SERVICE_ROLE_KEY nos secrets do servidor.",
        threads_checked: 0,
        cases_archived: 0,
        errors: 0,
      };
    }

    const casesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/cases?select=id,thread_id&archived=is.false&thread_id=not.is.null&limit=5000`,
      {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      },
    );

    if (!casesRes.ok) {
      const txt = await casesRes.text().catch(() => "");
      return {
        ok: false,
        error: "supabase_error",
        message: `Erro ao listar cases (${casesRes.status}): ${txt.slice(0, 180)}`,
        threads_checked: 0,
        cases_archived: 0,
        errors: 1,
      };
    }

    const cases = (await casesRes.json()) as SupabaseCase[];
    let checked = 0;
    let errors = 0;
    const toArchive: number[] = [];

    for (const c of cases) {
      if (!c.thread_id) continue;
      checked++;
      try {
        const r = await fetch(`https://discord.com/api/v10/channels/${c.thread_id}`, {
          headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
        });
        if (r.status === 404 || r.status === 410) {
          toArchive.push(c.id);
        } else if (r.status === 429) {
          await new Promise((res) => setTimeout(res, 1500));
        } else if (!r.ok && r.status !== 403) {
          errors++;
        }
      } catch {
        errors++;
      }
      await new Promise((res) => setTimeout(res, 50));
    }

    let archived = 0;
    if (toArchive.length > 0) {
      const upd = await fetch(
        `${SUPABASE_URL}/rest/v1/cases?id=in.(${toArchive.join(",")})`,
        {
          method: "PATCH",
          headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ archived: true }),
        },
      );
      if (upd.ok) archived = toArchive.length;
      else errors++;
    }

    return { ok: true, threads_checked: checked, cases_archived: archived, errors };
  },
);

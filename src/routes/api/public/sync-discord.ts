import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

type SupabaseCase = { id: number; thread_id: string | number | null; archived: boolean | null };

async function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

export const Route = createFileRoute("/api/public/sync-discord")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      POST: async () => {
        const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
        const SUPABASE_URL = process.env.SUPABASE_URL || "https://drnxnqguyqndmozmovxu.supabase.co";
        const SERVICE_KEY =
          process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

        if (!DISCORD_BOT_TOKEN) {
          return json({
            ok: false,
            error: "not_configured",
            message:
              "Sync do Discord ainda não configurado. Adicione o secret DISCORD_BOT_TOKEN para ativar.",
            threads_checked: 0,
            cases_archived: 0,
            errors: 0,
          });
        }

        if (!SERVICE_KEY) {
          return json({
            ok: false,
            error: "not_configured",
            message: "Faltando SUPABASE_SERVICE_ROLE_KEY nos secrets do servidor.",
            threads_checked: 0,
            cases_archived: 0,
            errors: 0,
          });
        }

        // Fetch active cases (thread_id present, not archived)
        const casesRes = await fetch(
          `${SUPABASE_URL}/rest/v1/cases?select=id,thread_id,archived&archived=is.false&thread_id=not.is.null&limit=5000`,
          {
            headers: {
              apikey: SERVICE_KEY,
              Authorization: `Bearer ${SERVICE_KEY}`,
            },
          },
        );

        if (!casesRes.ok) {
          const txt = await casesRes.text().catch(() => "");
          return json({
            ok: false,
            error: "supabase_error",
            message: `Erro ao listar cases: ${casesRes.status} ${txt.slice(0, 200)}`,
            threads_checked: 0,
            cases_archived: 0,
            errors: 1,
          });
        }

        const cases = (await casesRes.json()) as SupabaseCase[];
        let checked = 0;
        let archived = 0;
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
              // rate-limited: back off a bit
              await new Promise((res) => setTimeout(res, 1500));
            } else if (!r.ok && r.status !== 403) {
              errors++;
            }
          } catch {
            errors++;
          }
          // gentle throttle to avoid Discord rate limits
          await new Promise((res) => setTimeout(res, 60));
        }

        if (toArchive.length > 0) {
          const idsFilter = `id=in.(${toArchive.join(",")})`;
          const upd = await fetch(`${SUPABASE_URL}/rest/v1/cases?${idsFilter}`, {
            method: "PATCH",
            headers: {
              apikey: SERVICE_KEY,
              Authorization: `Bearer ${SERVICE_KEY}`,
              "Content-Type": "application/json",
              Prefer: "return=minimal",
            },
            body: JSON.stringify({ archived: true }),
          });
          if (upd.ok) archived = toArchive.length;
          else errors++;
        }

        return json({
          ok: true,
          threads_checked: checked,
          cases_archived: archived,
          errors,
        });
      },
    },
  },
});

import type { CaseRow } from "./supabase";

// Guild ID do servidor Cloudia no Discord
export const DISCORD_GUILD_ID = "763464035911073804";
// Canal padrão usado como fallback quando o thread foi excluído / id inválido
export const DISCORD_FALLBACK_CHANNEL_ID = "763464036418453559";
export const DISCORD_FALLBACK_URL = `https://discord.com/channels/${DISCORD_GUILD_ID}/${DISCORD_FALLBACK_CHANNEL_ID}`;

/** Retorna a URL do tópico no Discord, ou a URL do canal padrão caso o thread_id seja inválido/ausente. */
export function discordThreadUrl(r: Pick<CaseRow, "thread_id">): string {
  const tid = r.thread_id != null ? String(r.thread_id) : "";
  // Snowflakes do Discord têm pelo menos 15 dígitos
  if (tid && /^\d{15,}$/.test(tid)) {
    return `https://discord.com/channels/${DISCORD_GUILD_ID}/${tid}`;
  }
  return DISCORD_FALLBACK_URL;
}

// Palavras-chave usadas para identificar casos de teste (a partir do título).
const TEST_KEYWORDS = [
  "teste",
  "test",
  "[test]",
  "[teste]",
  "testing",
  "homolog",
  "sandbox",
  "qa ",
  " qa",
  "dummy",
  "ignorar",
];

/** Heurística para identificar casos de teste pelo título (case-insensitive). */
export function isTestCase(r: Pick<CaseRow, "thread_title">): boolean {
  const title = (r.thread_title || "").toLowerCase().trim();
  if (!title) return false;
  return TEST_KEYWORDS.some((kw) => title.includes(kw));
}

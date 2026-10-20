// Guild ID do servidor Cloudia no Discord
export const DISCORD_GUILD_ID = "763464035911073804";
// Canal padrão usado como fallback quando o thread foi excluído / id inválido
export const DISCORD_FALLBACK_CHANNEL_ID = "763464036418453559";
export const DISCORD_FALLBACK_URL = `https://discord.com/channels/${DISCORD_GUILD_ID}/${DISCORD_FALLBACK_CHANNEL_ID}`;

/** Retorna a URL do tópico no Discord, ou a URL do canal padrão caso o thread_id seja inválido/ausente. */
export function discordThreadUrl(r: { thread_id: string | number | null }): string {
  const tid = r.thread_id != null ? String(r.thread_id) : "";
  // Snowflakes do Discord têm pelo menos 15 dígitos
  if (tid && /^\d{15,}$/.test(tid)) {
    return `https://discord.com/channels/${DISCORD_GUILD_ID}/${tid}`;
  }
  return DISCORD_FALLBACK_URL;
}

// Palavras inteiras que marcam um caso de teste no título. Palavra inteira para não
// pegar "atestado", "contestação" ou "qualidade".
const TEST_WORDS =
  /(^|[^\p{L}])(teste|testes|test|testing|homolog|homologação|sandbox|qa|dummy|ignorar)([^\p{L}]|$)/iu;

/** Heurística para identificar casos de teste pelo título. */
export function isTestCase(r: { thread_title: string | null }): boolean {
  const title = (r.thread_title || "").trim();
  return !!title && TEST_WORDS.test(title);
}

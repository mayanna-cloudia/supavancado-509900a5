// Só roda no servidor (server functions). Senhas e chave de serviço vêm dos secrets do projeto:
//   ADMIN_PASSWORD, COORD_PASSWORD, SESSION_SECRET (opcional), SB_SERVICE_ROLE_KEY, OPENROUTER_API_KEY
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "../supabase";

export type Role = "admin" | "coord";
const SESSION_HOURS = 12;

function env(name: string): string | undefined {
  return process.env[name] || undefined;
}

// O Lovable reserva o prefixo SUPABASE_ para o banco que ele mesmo gerencia (o antigo).
// Por isso a chave do banco novo vem só de SB_SERVICE_ROLE_KEY, nunca de SUPABASE_SERVICE_ROLE_KEY.
export function serviceKey(): string {
  const key = env("SB_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Falta o secret SB_SERVICE_ROLE_KEY no servidor.");
  return key;
}

export function serviceClient() {
  return createClient(SUPABASE_URL, serviceKey(), { auth: { persistSession: false } });
}

function secret(): string {
  const s =
    env("SESSION_SECRET") || `${env("ADMIN_PASSWORD") ?? ""}|${env("COORD_PASSWORD") ?? ""}`;
  if (s === "|") throw new Error("Faltam os secrets ADMIN_PASSWORD e COORD_PASSWORD no servidor.");
  return s;
}

async function hmac(text: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=+$/, "");
}

/** Comparação que não vaza, pelo tempo de resposta, quantos caracteres da senha acertaram. */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Confere a senha e devolve um token assinado que vale por algumas horas. */
export async function issueToken(role: Role, password: string): Promise<string | null> {
  const expected = role === "admin" ? env("ADMIN_PASSWORD") : env("COORD_PASSWORD");
  if (!expected)
    throw new Error(
      `Falta o secret ${role === "admin" ? "ADMIN_PASSWORD" : "COORD_PASSWORD"} no servidor.`,
    );
  const adminPass = env("ADMIN_PASSWORD");
  // A senha do admin também abre a coordenação
  const ok =
    safeEqual(password, expected) ||
    (role === "coord" && !!adminPass && safeEqual(password, adminPass));
  if (!ok) return null;
  const grant: Role =
    role === "coord" && adminPass && safeEqual(password, adminPass) ? "admin" : role;
  const payload = `${grant}.${Date.now() + SESSION_HOURS * 3600_000}`;
  return `${payload}.${await hmac(payload)}`;
}

/** Valida o token. Admin pode tudo; coordenação só o que for de coordenação. */
export async function requireRole(token: string | undefined, need: Role): Promise<Role> {
  const parts = (token || "").split(".");
  if (parts.length !== 3) throw new Error("Sessão inválida. Entre de novo.");
  const [role, exp, sig] = parts;
  if (!safeEqual(sig, await hmac(`${role}.${exp}`)))
    throw new Error("Sessão inválida. Entre de novo.");
  if (Date.now() > Number(exp)) throw new Error("Sessão expirada. Entre de novo.");
  if (role !== "admin" && role !== need) throw new Error("Sem acesso a esta área.");
  return role as Role;
}

export function openRouterKey(): string {
  const key = env("OPENROUTER_API_KEY");
  if (!key) throw new Error("Falta o secret OPENROUTER_API_KEY no servidor.");
  return key;
}

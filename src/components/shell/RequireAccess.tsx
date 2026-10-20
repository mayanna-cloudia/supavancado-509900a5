import { Lock, Loader2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { login } from "@/lib/actions.functions";
import type { Role } from "@/lib/server/session";

const KEY = "sa2_session";

type Session = { token: string; role: Role; exp: number };

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}

/** Token da sessão atual, para mandar nas server functions. */
export function sessionToken(): string {
  return readSession()?.token ?? "";
}

export function clearSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Mostra o conteúdo só depois da senha da área. Admin abre tudo. */
export function RequireAccess({
  role,
  title,
  children,
}: {
  role: Role;
  title: string;
  children: ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSession(readSession());
    setReady(true);
  }, []);

  const allowed = session && (session.role === "admin" || session.role === role);
  if (!ready) return null;
  if (allowed) return <>{children}</>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await login({ data: { role, password } });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    const s: Session = { token: res.token, role: res.role, exp: Number(res.token.split(".")[1]) };
    try {
      sessionStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* sem storage: vale até recarregar */
    }
    setSession(s);
  };

  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <form onSubmit={submit} className="card flex w-full max-w-sm flex-col gap-4 p-6">
        <div className="flex items-center gap-3">
          <div className="bg-grad-brand flex h-10 w-10 items-center justify-center rounded-lg text-white">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold">{title}</h1>
            <div className="text-[13px] text-muted-foreground">Área restrita. Digite a senha.</div>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="senha" className="text-[13px] text-muted-foreground">
            Senha
          </label>
          <input
            id="senha"
            type="password"
            autoFocus
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            className="h-10 rounded-lg border border-border bg-card px-3 text-foreground"
          />
          {error && <div className="text-[13px] text-red">{error}</div>}
        </div>
        <button
          type="submit"
          disabled={busy || !password}
          className="flex h-10 items-center justify-center gap-2 rounded-lg bg-[#3760ff] font-medium text-white disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Entrar
        </button>
      </form>
    </div>
  );
}

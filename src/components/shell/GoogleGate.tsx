import { Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { CLOUDIA_DOMAIN, signInWithGoogle, useAuth } from "@/lib/auth";

/** Todo o painel só abre para quem entra com o Google da Cloudia. */
export function GoogleGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (auth.status === "in") return <>{children}</>;
  if (auth.status === "loading")
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="Carregando" />
      </div>
    );

  const enter = async () => {
    setBusy(true);
    setError("");
    const { error } = await signInWithGoogle();
    if (error) {
      setBusy(false);
      setError("Não consegui abrir o login do Google. Tente de novo em instantes.");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 text-foreground">
      <div className="card flex w-full max-w-sm flex-col items-center gap-5 p-7 text-center">
        <img src="/cloudia-logo-light.png" alt="Cloudia" className="h-[30px] w-auto dark:hidden" />
        <img src="/cloudia-logo-dark.png" alt="Cloudia" className="hidden h-[30px] w-auto dark:block" />
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-lg font-bold">Suporte Avançado</h1>
          <div className="text-[13.5px] text-muted-foreground">
            Entre com o seu e-mail @{CLOUDIA_DOMAIN} para ver o painel.
          </div>
        </div>
        {auth.status === "wrong" && (
          <div className="w-full rounded-lg bg-hover px-3 py-2 text-[13px] text-red">
            {auth.email || "Essa conta"} não é da Cloudia. Entre com o seu e-mail @{CLOUDIA_DOMAIN}.
          </div>
        )}
        {error && <div className="text-[13px] text-red">{error}</div>}
        <button
          type="button"
          onClick={enter}
          disabled={busy}
          className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-card font-medium text-foreground hover:bg-hover disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
          Entrar com Google
        </button>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

import type { Session, User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export const CLOUDIA_DOMAIN = "cloudia.com.br";

/** Mesmo critério do banco (public.is_cloudia): Google + email da Cloudia. */
export function isCloudiaUser(user: User | null | undefined) {
  const email = (user?.email ?? "").toLowerCase();
  return user?.app_metadata?.provider === "google" && email.endsWith(`@${CLOUDIA_DOMAIN}`);
}

export function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.href,
      // hd: o Google já mostra só as contas da Cloudia; o banco confere de novo
      queryParams: { hd: CLOUDIA_DOMAIN, prompt: "select_account" },
    },
  });
}

export function signOut() {
  return supabase.auth.signOut();
}

export type AuthState =
  | { status: "loading" }
  | { status: "out" }
  | { status: "wrong"; email: string }
  | { status: "in"; session: Session };

/** Sessão do Google. Conta de fora da Cloudia é desconectada na hora. */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    const apply = (session: Session | null) => {
      if (!session) {
        // O signOut de uma conta errada também cai aqui: mantém o aviso
        setState((prev) => (prev.status === "wrong" ? prev : { status: "out" }));
        return;
      }
      if (isCloudiaUser(session.user)) {
        setState({ status: "in", session });
        // Tira o ?code= do retorno do Google da barra de endereço
        const url = new URL(window.location.href);
        if (url.searchParams.has("code")) {
          url.searchParams.delete("code");
          window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
        }
        return;
      }
      setState({ status: "wrong", email: session.user.email ?? "" });
      supabase.auth.signOut();
    };
    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => apply(session));
    return () => data.subscription.unsubscribe();
  }, []);

  return state;
}

/** Token do login Google, para as server functions saberem quem é. */
export async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

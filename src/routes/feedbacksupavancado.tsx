import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { sendPanelFeedback } from "@/lib/actions.functions";
import { useTheme } from "@/lib/prefs";

// Rota escondida: fora do menu e fora dos buscadores. O link vai só para o time.
export const Route = createFileRoute("/feedbacksupavancado")({
  head: () => ({
    meta: [
      { title: "Feedback do painel · Suporte Avançado" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FeedbackPage,
});

const SENT_KEY = "sa2_feedback_sent";
const SCREENS = ["Hoje", "Casos", "Problemas que voltam", "Ainda não usei"];

function readSent(): string | null {
  try {
    return localStorage.getItem(SENT_KEY);
  } catch {
    return null;
  }
}

function FeedbackPage() {
  const { dark } = useTheme();
  const [sent, setSent] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [screen, setScreen] = useState("");
  const [good, setGood] = useState("");
  const [improve, setImprove] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSent(readSent());
    setReady(true);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!score) {
      setError("Escolha uma nota de 1 a 5.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await sendPanelFeedback({ data: { name, email, score, screen, good, improve } });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    const status = res.already ? "already" : "sent";
    try {
      localStorage.setItem(SENT_KEY, status);
    } catch {
      /* sem storage: o aviso vale até recarregar */
    }
    setSent(status);
  };

  const chip = (on: boolean) =>
    [
      "min-h-10 rounded-full border px-3.5 text-sm",
      on ? "border-brand bg-brand-soft font-bold text-brand-text" : "border-border bg-card",
    ].join(" ");

  return (
    <div className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto flex max-w-[620px] flex-col gap-5">
        <img
          src={dark ? "/cloudia-logo-dark.png" : "/cloudia-logo-light.png"}
          alt="Cloudia"
          className="h-[30px] w-auto self-start"
        />
        <div className="bg-grad-brand flex flex-col gap-1.5 rounded-[14px] px-6 py-5 text-white">
          <div className="text-xs font-bold uppercase tracking-[0.08em] opacity-90">
            Suporte Avançado
          </div>
          <h1 className="m-0 text-2xl font-bold leading-tight">
            Conta pra gente o que achou do painel novo
          </h1>
          <p className="m-0">
            Leva 1 minuto. Cada pessoa responde uma vez, e só a coordenação do Suporte Avançado vê
            as respostas.
          </p>
        </div>

        {!ready ? null : sent ? (
          <div className="card flex items-start gap-3 px-5 py-5">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-green" />
            <div>
              <div className="text-base font-bold">
                {sent === "already" ? "Você já tinha respondido" : "Feedback enviado. Obrigada!"}
              </div>
              <div className="text-muted-foreground">
                {sent === "already"
                  ? "Já temos uma resposta com esse e-mail. Se quiser acrescentar alguma coisa, fale direto com a Mayanna."
                  : "Sua resposta ajuda a deixar o painel do jeito que o time precisa."}
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="card flex flex-col gap-5 px-5 py-5" noValidate>
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))]">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="fb-name" className="font-bold">
                  Qual é o seu nome?
                </label>
                <input
                  id="fb-name"
                  autoComplete="name"
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-11 rounded-lg border border-border bg-card px-3 text-foreground"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="fb-email" className="font-bold">
                  Qual é o seu e-mail?
                </label>
                <input
                  id="fb-email"
                  type="email"
                  autoComplete="email"
                  maxLength={200}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@cloudia.com.br"
                  className="h-11 rounded-lg border border-border bg-card px-3 text-foreground"
                />
              </div>
            </div>

            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-2 p-0 font-bold">De 1 a 5, como está o painel novo?</legend>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={score === n}
                    onClick={() => setScore(n)}
                    className={chip(score === n)}
                  >
                    {n === 1 ? "1 · ruim" : n === 3 ? "3 · ok" : n === 5 ? "5 · ótimo" : n}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-2 p-0 font-bold">Qual tela você mais usa?</legend>
              <div className="flex flex-wrap gap-2">
                {SCREENS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={screen === s}
                    onClick={() => setScreen(s)}
                    className={chip(screen === s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="fb-good" className="font-bold">
                O que ficou bom?
              </label>
              <textarea
                id="fb-good"
                rows={3}
                maxLength={1500}
                value={good}
                onChange={(e) => setGood(e.target.value)}
                placeholder="Opcional"
                className="resize-y rounded-lg border border-border bg-card px-3 py-2.5 text-foreground"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="fb-improve" className="font-bold">
                O que está faltando ou atrapalhando?
              </label>
              <textarea
                id="fb-improve"
                rows={3}
                maxLength={1500}
                value={improve}
                onChange={(e) => setImprove(e.target.value)}
                placeholder="Ex.: queria filtrar por clínica direto na tela Hoje"
                className="resize-y rounded-lg border border-border bg-card px-3 py-2.5 text-foreground"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={busy}
                className="flex h-11 items-center gap-2 rounded-lg bg-[#3760ff] px-5 font-bold text-white disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Enviar feedback
              </button>
              {error && (
                <span role="alert" className="text-sm text-red">
                  {error}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              Uma resposta por e-mail. Depois de enviar, não dá para editar.
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

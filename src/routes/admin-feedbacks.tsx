import { createFileRoute, redirect } from "@tanstack/react-router";

// Endereço antigo: a validação agora fica no Admin
export const Route = createFileRoute("/admin-feedbacks")({
  beforeLoad: () => {
    throw redirect({ to: "/admin" });
  },
});

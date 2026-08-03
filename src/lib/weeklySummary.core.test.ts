import { describe, expect, it, vi } from "vitest";
import {
  buildPrompt,
  generateSummaryText,
  MAX_INPUT_CHARS,
  type WeekCaseInput,
} from "./weeklySummary.core";

const cases: WeekCaseInput[] = [
  { summary: "Bot não responde", resolution: "Reiniciado o serviço" },
  { summary: "Erro no agendamento", resolution: "Corrigido horário da clínica" },
];

function reply(content: string, finish_reason: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content }, finish_reason }] }),
    text: async () => "",
  } as unknown as Response;
}

describe("buildPrompt", () => {
  it("inclui todos os casos e instruções", () => {
    const p = buildPrompt(cases);
    expect(p).toContain("Bot não responde");
    expect(p).toContain("Erro no agendamento");
    expect(p).toContain("resumo COMPLETO");
  });

  it("respeita o limite de caracteres", () => {
    const many: WeekCaseInput[] = Array.from({ length: 5000 }, () => ({
      summary: "x".repeat(500),
      resolution: "y".repeat(500),
    }));
    expect(buildPrompt(many).length).toBeLessThan(MAX_INPUT_CHARS + 2000);
  });
});

describe("generateSummaryText", () => {
  it("retorna o texto completo em uma chamada", async () => {
    const f = vi.fn().mockResolvedValue(reply("# Resumo\nCompleto.", "stop"));
    const res = await generateSummaryText(cases, "key", f as unknown as typeof fetch);
    expect(res).toEqual({ ok: true, text: "# Resumo\nCompleto.", truncated: false });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("continua quando a resposta é cortada e junta as partes", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(reply("# Resumo\nParte 1 ", "length"))
      .mockResolvedValueOnce(reply("parte 2 final.", "stop"));
    const res = await generateSummaryText(cases, "key", f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(2);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.text).toBe("# Resumo\nParte 1parte 2 final.");
      expect(res.truncated).toBe(false);
    }
  });

  it("envia o histórico na continuação", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(reply("A", "length"))
      .mockResolvedValueOnce(reply("B", "stop"));
    await generateSummaryText(cases, "key", f as unknown as typeof fetch);
    const body = JSON.parse((f.mock.calls[1]![1] as RequestInit).body as string);
    expect(body.messages).toHaveLength(3);
    expect(body.messages[1]).toEqual({ role: "assistant", content: "A" });
    expect(body.messages[2].content).toContain("Continue");
    expect(body.max_tokens).toBeGreaterThanOrEqual(8000);
  });

  it("para depois do limite de continuações", async () => {
    const f = vi.fn().mockResolvedValue(reply("mais...", "length"));
    const res = await generateSummaryText(cases, "key", f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(4);
    expect(res.ok).toBe(true);
  });

  it("preserva o texto parcial se uma continuação falhar", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(reply("Parcial", "length"))
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "boom" } as unknown as Response);
    const res = await generateSummaryText(cases, "key", f as unknown as typeof fetch);
    expect(res).toMatchObject({ ok: true, text: "Parcial", truncated: true });
  });

  it("mapeia erros de rate limit e créditos", async () => {
    const rate = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 429, text: async () => "" } as unknown as Response);
    await expect(generateSummaryText(cases, "k", rate as unknown as typeof fetch)).resolves.toMatchObject({
      ok: false,
    });
    const credits = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 402, text: async () => "" } as unknown as Response);
    const res = await generateSummaryText(cases, "k", credits as unknown as typeof fetch);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain("Créditos");
  });

  it("recusa semana sem casos", async () => {
    const f = vi.fn();
    const res = await generateSummaryText([], "k", f as unknown as typeof fetch);
    expect(res.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});

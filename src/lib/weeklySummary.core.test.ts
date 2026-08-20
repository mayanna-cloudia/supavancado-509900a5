import { describe, expect, it, vi } from "vitest";
import {
  buildCasesBlock,
  buildPrompt,
  formatPeriodLabel,
  generateSummaryText,
  MAX_INPUT_CHARS,
  type WeekCaseInput,
  type WeekMeta,
} from "./weeklySummary.core";

const cases: WeekCaseInput[] = [
  { summary: "Bot não responde", resolution: "Reiniciado o serviço" },
  { summary: "Erro no agendamento", resolution: "Corrigido horário da clínica" },
];

const meta: WeekMeta = {
  periodLabel: "10/08 a 16/08",
  escalationChannel: "#suporte-n3",
};

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
    const p = buildPrompt(cases, meta);
    expect(p).toContain("Bot não responde");
    expect(p).toContain("Erro no agendamento");
    expect(p).toContain("Escreva o boletim **completo**");
    expect(p).toContain("10/08 a 16/08");
    expect(p).toContain("#suporte-n3");
    expect(p).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it("falha sem período", () => {
    expect(() => buildPrompt(cases, { ...meta, periodLabel: "" })).toThrow(/periodLabel/);
  });

  it("respeita o limite de caracteres", () => {
    const many: WeekCaseInput[] = Array.from({ length: 5000 }, () => ({
      summary: "x".repeat(500),
      resolution: "y".repeat(500),
    }));
    expect(buildCasesBlock(many).block.length).toBeLessThan(MAX_INPUT_CHARS + 200);
  });
});

describe("formatPeriodLabel", () => {
  it("formata dia/mês", () => {
    const label = formatPeriodLabel(new Date("2026-08-10T12:00:00Z"), new Date("2026-08-16T12:00:00Z"));
    expect(label).toBe("10/08 a 16/08");
  });
});

describe("generateSummaryText", () => {
  it("retorna o texto completo em uma chamada", async () => {
    const f = vi.fn().mockResolvedValue(reply("# Resumo\nCompleto.", "stop"));
    const res = await generateSummaryText(cases, "key", meta, f as unknown as typeof fetch);
    expect(res).toEqual({ ok: true, text: "# Resumo\nCompleto.", truncated: false });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("continua quando a resposta é cortada e junta as partes", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(reply("# Resumo\nParte 1 ", "length"))
      .mockResolvedValueOnce(reply("parte 2 final.", "stop"));
    const res = await generateSummaryText(cases, "key", meta, f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(2);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.text).toBe("# Resumo\nParte 1 parte 2 final.");
      expect(res.truncated).toBe(false);
    }
  });

  it("envia o histórico na continuação", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(reply("A", "length"))
      .mockResolvedValueOnce(reply("B", "stop"));
    await generateSummaryText(cases, "key", meta, f as unknown as typeof fetch);
    const body = JSON.parse((f.mock.calls[1]![1] as RequestInit).body as string);
    expect(body.messages).toHaveLength(3);
    expect(body.messages[1]).toEqual({ role: "assistant", content: "A" });
    expect(body.messages[2].content).toContain("Continue");
    expect(body.max_tokens).toBeGreaterThanOrEqual(8000);
  });

  it("para depois do limite de continuações", async () => {
    const f = vi.fn().mockResolvedValue(reply("mais...", "length"));
    const res = await generateSummaryText(cases, "key", meta, f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(4);
    expect(res.ok).toBe(true);
  });

  it("preserva o texto parcial se uma continuação falhar", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(reply("Parcial", "length"))
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "boom" } as unknown as Response);
    const res = await generateSummaryText(cases, "key", meta, f as unknown as typeof fetch);
    expect(res).toMatchObject({ ok: true, text: "Parcial", truncated: true });
  });

  it("mapeia erros de rate limit e créditos", async () => {
    const rate = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 429, text: async () => "" } as unknown as Response);
    await expect(
      generateSummaryText(cases, "k", meta, rate as unknown as typeof fetch),
    ).resolves.toMatchObject({ ok: false });
    const credits = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 402, text: async () => "" } as unknown as Response);
    const res = await generateSummaryText(cases, "k", meta, credits as unknown as typeof fetch);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain("Créditos");
  });

  it("recusa semana sem casos", async () => {
    const f = vi.fn();
    const res = await generateSummaryText([], "k", meta, f as unknown as typeof fetch);
    expect(res.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});

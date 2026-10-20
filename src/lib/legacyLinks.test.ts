import { describe, expect, it } from "vitest";
import { legacyTarget } from "./legacyLinks";

describe("legacyTarget", () => {
  it("idclinic abre Casos da clínica", () => {
    expect(legacyTarget({ idclinic: "372" })).toEqual({
      to: "/casos",
      search: { idclinic: "372" },
    });
  });
  it("idclinic + prioridade + abertos", () => {
    expect(legacyTarget({ idclinic: 372, priority: "P1", status: "open" })).toEqual({
      to: "/casos",
      search: { idclinic: "372", prioridade: "P1" },
    });
  });
  it("tab=sla com área abre Hoje na fila da área", () => {
    expect(legacyTarget({ tab: "sla", area: "SuporteN2" })).toEqual({
      to: "/",
      search: { fila: "n2" },
    });
  });
  it("q e search viram busca em Casos", () => {
    expect(legacyTarget({ q: "login" })).toEqual({ to: "/casos", search: { q: "login" } });
    expect(legacyTarget({ search: "login" })).toEqual({ to: "/casos", search: { q: "login" } });
  });
  it("valores all, resolvidos, sem área e categoria", () => {
    expect(
      legacyTarget({ priority: "all", status: "resolved", area: "unassigned", category: "Bug" }),
    ).toEqual({ to: "/casos", search: { status: "resolvidos", area: "sem", categoria: "Bug" } });
    expect(legacyTarget({ status: "all", area: "all" })).toEqual({
      to: "/casos",
      search: { status: "todos" },
    });
  });
  it("abas team e metrics", () => {
    expect(legacyTarget({ tab: "team" })).toEqual({ to: "/coordenacao", search: {} });
    expect(legacyTarget({ tab: "metrics" })).toEqual({ to: "/problemas", search: {} });
  });
  it("sem parâmetro antigo não redireciona", () => {
    expect(legacyTarget({})).toBeNull();
    expect(legacyTarget({ fila: "n2" })).toBeNull();
    expect(legacyTarget({ tab: "overview" })).toBeNull();
  });
});

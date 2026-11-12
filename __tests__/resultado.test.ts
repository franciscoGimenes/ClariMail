import { describe, expect, test } from "vitest";
import {
  normalizarResultado,
  resultadoSchema,
  vereditoPorNota,
} from "@/lib/resultado";

describe("vereditoPorNota (0–39 seguro, 40–69 suspeito, 70–100 phishing)", () => {
  test.each([
    [0, "seguro"],
    [20, "seguro"],
    [39, "seguro"],
    [40, "suspeito"],
    [55, "suspeito"],
    [69, "suspeito"],
    [70, "phishing"],
    [85, "phishing"],
    [100, "phishing"],
  ] as const)("nota %i -> %s", (nota, esperado) => {
    expect(vereditoPorNota(nota)).toBe(esperado);
  });
});

describe("resultadoSchema", () => {
  const valido = {
    veredito: "phishing",
    nota: 85,
    resumo: "Este e-mail pede sua senha. Não clique no link.",
    indicios: [],
  };

  test("aceita um resultado válido", () => {
    expect(resultadoSchema.safeParse(valido).success).toBe(true);
  });

  test.each([
    ["veredito desconhecido", { ...valido, veredito: "perigoso" }],
    ["nota abaixo de 0", { ...valido, nota: -1, veredito: "seguro" }],
    ["nota acima de 100", { ...valido, nota: 101 }],
    ["nota com casas decimais", { ...valido, nota: 85.5 }],
    ["resumo vazio", { ...valido, resumo: "   " }],
    ["sem indicios", { veredito: "phishing", nota: 85, resumo: "x" }],
    ["veredito que não combina com a nota", { ...valido, nota: 10 }],
  ])("recusa %s", (_, dados) => {
    expect(resultadoSchema.safeParse(dados).success).toBe(false);
  });
});

describe("normalizarResultado", () => {
  test("a nota prevalece quando o veredito do modelo não combina", () => {
    const r = normalizarResultado({
      veredito: "seguro",
      nota: 82,
      resumo: "Resumo.",
    });
    expect(r.veredito).toBe("phishing");
    expect(r.nota).toBe(82);
  });

  test("limita a nota entre 0 e 100", () => {
    expect(
      normalizarResultado({ veredito: "phishing", nota: 140, resumo: "x" })
        .nota,
    ).toBe(100);
    expect(
      normalizarResultado({ veredito: "seguro", nota: -5, resumo: "x" }).nota,
    ).toBe(0);
  });

  test("devolve indicios vazio nesta sprint", () => {
    expect(
      normalizarResultado({ veredito: "suspeito", nota: 50, resumo: "x" })
        .indicios,
    ).toEqual([]);
  });
});

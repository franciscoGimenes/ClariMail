import { describe, expect, test } from "vitest";
import { nivelPorNota } from "@/lib/nivel";
import { vereditoPorNota } from "@/lib/resultado";

describe("nivelPorNota (baixo 0–39, médio 40–69, alto 70–100)", () => {
  test.each([
    [0, "baixo"],
    [39, "baixo"],
    [40, "medio"],
    [69, "medio"],
    [70, "alto"],
    [100, "alto"],
  ] as const)("nota %i → %s", (nota, esperado) => {
    expect(nivelPorNota(nota)).toBe(esperado);
  });

  test("o veredito segue o mesmo nível em todas as notas de 0 a 100", () => {
    const vereditoDoNivel = { baixo: "seguro", medio: "suspeito", alto: "phishing" };
    for (let nota = 0; nota <= 100; nota++) {
      expect(vereditoPorNota(nota)).toBe(vereditoDoNivel[nivelPorNota(nota)]);
    }
  });
});

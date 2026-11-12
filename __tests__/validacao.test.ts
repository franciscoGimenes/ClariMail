import { describe, expect, test } from "vitest";
import {
  MAX_CARACTERES,
  MENSAGENS_VALIDACAO,
  MIN_CARACTERES,
  validarEntrada,
} from "@/lib/validacao";

describe("validarEntrada", () => {
  test("recusa texto vazio", () => {
    expect(validarEntrada({ texto: "" })).toEqual({
      ok: false,
      erro: MENSAGENS_VALIDACAO.vazio,
    });
  });

  test("recusa texto só com espaços e quebras de linha", () => {
    expect(validarEntrada({ texto: "   \n\t  " })).toEqual({
      ok: false,
      erro: MENSAGENS_VALIDACAO.vazio,
    });
  });

  test(`recusa texto com menos de ${MIN_CARACTERES} caracteres`, () => {
    expect(validarEntrada({ texto: "a".repeat(MIN_CARACTERES - 1) })).toEqual({
      ok: false,
      erro: MENSAGENS_VALIDACAO.curto,
    });
  });

  test("ignora espaços nas pontas ao contar o mínimo", () => {
    const texto = `   ${"a".repeat(MIN_CARACTERES - 1)}   `;
    expect(validarEntrada({ texto }).ok).toBe(false);
  });

  test(`aceita exatamente ${MIN_CARACTERES} caracteres e devolve o texto sem espaços nas pontas`, () => {
    const texto = "b".repeat(MIN_CARACTERES);
    expect(validarEntrada({ texto: `  ${texto}\n` })).toEqual({
      ok: true,
      texto,
    });
  });

  test(`aceita exatamente ${MAX_CARACTERES} caracteres`, () => {
    expect(validarEntrada({ texto: "c".repeat(MAX_CARACTERES) }).ok).toBe(true);
  });

  test(`recusa texto acima de ${MAX_CARACTERES} caracteres`, () => {
    expect(validarEntrada({ texto: "c".repeat(MAX_CARACTERES + 1) })).toEqual({
      ok: false,
      erro: MENSAGENS_VALIDACAO.longo,
    });
  });

  test.each([null, undefined, {}, { texto: 123 }, "texto solto"])(
    "recusa corpo em formato inválido: %j",
    (corpo) => {
      expect(validarEntrada(corpo)).toEqual({
        ok: false,
        erro: MENSAGENS_VALIDACAO.formato,
      });
    },
  );

  test("a mensagem de erro nunca repete o texto do e-mail", () => {
    const texto = "SEGREDO123 curto";
    const resultado = validarEntrada({ texto });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.erro).not.toContain("SEGREDO123");
  });
});

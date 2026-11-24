import { describe, expect, test } from "vitest";
import { dividirEmPedacos, indicesDestacados, localizarTrecho } from "@/lib/destaques";
import type { Gravidade } from "@/lib/resultado";

const EMAIL = `De: Banco Aurora <atendimento@aurora.example>
Assunto: URGENTE:   sua conta foi bloqueada

Prezado cliente, confirme sua SENHA
em até 24 horas: http://189.45.12.7/login`;

const ind = (gravidade: Gravidade, trecho: string | null) => ({ gravidade, trecho });

/** Junta os pedaços de volta (tem que dar o texto original). */
const juntar = (pedacos: { texto: string }[]) => pedacos.map((p) => p.texto).join("");
const destacados = (pedacos: ReturnType<typeof dividirEmPedacos>) =>
  pedacos.filter((p) => p.tipo === "destaque").map((p) => p.tipo === "destaque" && [p.texto, p.indice, p.gravidade]);

describe("localizarTrecho", () => {
  test("ignora maiúsculas", () => {
    const pos = localizarTrecho(EMAIL, "confirme sua senha")!;
    expect(EMAIL.slice(pos.inicio, pos.fim)).toBe("confirme sua SENHA");
  });

  test("ignora espaços repetidos e quebras de linha", () => {
    const pos = localizarTrecho(EMAIL, "urgente: sua conta foi bloqueada")!;
    expect(EMAIL.slice(pos.inicio, pos.fim)).toBe("URGENTE:   sua conta foi bloqueada");

    const quebra = localizarTrecho(EMAIL, "sua senha em até 24 horas")!;
    expect(EMAIL.slice(quebra.inicio, quebra.fim)).toBe("sua SENHA\nem até 24 horas");
  });

  test("trecho com espaços sobrando nas pontas ou repetidos também é achado", () => {
    const pos = localizarTrecho(EMAIL, "  Prezado    cliente ")!;
    expect(EMAIL.slice(pos.inicio, pos.fim)).toBe("Prezado cliente");
  });

  test("trecho inexistente devolve null", () => {
    expect(localizarTrecho(EMAIL, "digite seu PIN")).toBeNull();
    expect(localizarTrecho(EMAIL, "   ")).toBeNull();
  });
});

describe("dividirEmPedacos", () => {
  test("marca os trechos e mantém o texto original inteiro", () => {
    const pedacos = dividirEmPedacos(EMAIL, [
      ind("critico", "CONFIRME SUA SENHA"),
      ind("atencao", "urgente:  sua conta foi bloqueada"),
    ]);
    expect(juntar(pedacos)).toBe(EMAIL);
    expect(destacados(pedacos)).toEqual([
      ["URGENTE:   sua conta foi bloqueada", 1, "atencao"],
      ["confirme sua SENHA", 0, "critico"],
    ]);
  });

  test("indício 'confiavel' e indício sem trecho não são destacados", () => {
    const pedacos = dividirEmPedacos(EMAIL, [
      ind("confiavel", "Banco Aurora"),
      ind("critico", null),
    ]);
    expect(destacados(pedacos)).toEqual([]);
    expect(pedacos).toEqual([{ tipo: "texto", texto: EMAIL }]);
  });

  test("trecho inexistente simplesmente não é marcado", () => {
    const pedacos = dividirEmPedacos(EMAIL, [
      ind("critico", "trecho que não existe"),
      ind("atencao", "Prezado cliente"),
    ]);
    expect(destacados(pedacos)).toEqual([["Prezado cliente", 1, "atencao"]]);
    expect(indicesDestacados(pedacos)).toEqual(new Set([1]));
  });

  test("sobreposição: prevalece o mais grave", () => {
    // "atenção" cobre a frase toda; "crítico" só a parte do meio.
    const pedacos = dividirEmPedacos(EMAIL, [
      ind("atencao", "Prezado cliente, confirme sua SENHA"),
      ind("critico", "confirme sua senha"),
    ]);
    expect(juntar(pedacos)).toBe(EMAIL);
    expect(destacados(pedacos)).toEqual([
      ["Prezado cliente, ", 0, "atencao"],
      ["confirme sua SENHA", 1, "critico"],
    ]);
  });

  test("sobreposição parcial: a parte que sobra continua com o menos grave", () => {
    const pedacos = dividirEmPedacos(EMAIL, [
      ind("critico", "sua SENHA em até"),
      ind("atencao", "em até 24 horas"),
    ]);
    expect(destacados(pedacos)).toEqual([
      ["sua SENHA\nem até", 0, "critico"],
      [" 24 horas", 1, "atencao"],
    ]);
  });

  test("mesma gravidade: prevalece o que vem primeiro na lista", () => {
    const pedacos = dividirEmPedacos(EMAIL, [
      ind("critico", "24 horas: http://189.45.12.7/login"),
      ind("critico", "http://189.45.12.7/login"),
    ]);
    expect(destacados(pedacos)).toEqual([["24 horas: http://189.45.12.7/login", 0, "critico"]]);
  });

  test("HTML e script no e-mail continuam como texto comum", () => {
    const html = `<script>alert("oi")</script><b>Clique</b> em <a href="x">aqui</a>`;
    const pedacos = dividirEmPedacos(html, [ind("critico", "<a href=\"x\">aqui</a>")]);
    expect(juntar(pedacos)).toBe(html);
    expect(destacados(pedacos)).toEqual([['<a href="x">aqui</a>', 0, "critico"]]);
  });
});

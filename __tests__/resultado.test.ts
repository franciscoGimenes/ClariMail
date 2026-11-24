import { describe, expect, test } from "vitest";
import {
  cortarTrecho,
  indicioSchema,
  normalizarResultado,
  ordenarIndicios,
  resultadoSchema,
  separarFrases,
  trechoExiste,
  vereditoPorNota,
} from "@/lib/resultado";

const EMAIL = `De: Banco Aurora <atendimento@aurora-seguranca.example>
Assunto: URGENTE: sua conta foi bloqueada

Prezado cliente, confirme sua   senha em até 24 horas no link http://203.0.113.7/login`;

const INDICIO = {
  titulo: "Pede sua senha",
  explicacao: "Bancos nunca pedem senha por e-mail. Não responda.",
  gravidade: "critico",
  trecho: "confirme sua senha",
  origem: "ia",
} as const;

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

describe("indicioSchema", () => {
  test("aceita um indício completo, com trecho ou com trecho null", () => {
    expect(indicioSchema.safeParse(INDICIO).success).toBe(true);
    expect(indicioSchema.safeParse({ ...INDICIO, trecho: null }).success).toBe(true);
    expect(indicioSchema.safeParse({ ...INDICIO, origem: "links" }).success).toBe(true);
    expect(
      indicioSchema.safeParse({ ...INDICIO, gravidade: "confiavel" }).success,
    ).toBe(true);
  });

  test.each([
    ["sem título", { ...INDICIO, titulo: "  " }],
    ["título longo demais", { ...INDICIO, titulo: "x".repeat(81) }],
    ["explicação vazia", { ...INDICIO, explicacao: "" }],
    [
      "explicação com 4 frases",
      { ...INDICIO, explicacao: "Uma frase. Outra frase. Mais uma. E a quarta." },
    ],
    ["gravidade desconhecida", { ...INDICIO, gravidade: "alto" }],
    ["trecho acima de 120 caracteres", { ...INDICIO, trecho: "a".repeat(121) }],
    ["sem trecho (precisa ser null)", { ...INDICIO, trecho: undefined }],
    ["origem desconhecida", { ...INDICIO, origem: "humano" }],
  ])("recusa %s", (_, dados) => {
    expect(indicioSchema.safeParse(dados).success).toBe(false);
  });
});

describe("separarFrases", () => {
  test("não confunde valores e abreviações com fim de frase", () => {
    expect(separarFrases("Pede R$ 1.500,00 de taxa. Não pague.")).toHaveLength(2);
    expect(separarFrases("Veja o site.exemplo agora. Depois responda!")).toHaveLength(2);
    expect(separarFrases("Uma só frase")).toHaveLength(1);
  });
});

describe("resultadoSchema", () => {
  const valido = {
    veredito: "phishing",
    nota: 85,
    resumo: "Este e-mail pede sua senha. Não clique no link.",
    indicios: [INDICIO],
  };

  test("aceita um resultado válido", () => {
    expect(resultadoSchema.safeParse(valido).success).toBe(true);
    expect(resultadoSchema.safeParse({ ...valido, indicios: [] }).success).toBe(true);
  });

  test.each([
    ["veredito desconhecido", { ...valido, veredito: "perigoso" }],
    ["nota abaixo de 0", { ...valido, nota: -1, veredito: "seguro" }],
    ["nota acima de 100", { ...valido, nota: 101 }],
    ["nota com casas decimais", { ...valido, nota: 85.5 }],
    ["resumo vazio", { ...valido, resumo: "   " }],
    ["sem indicios", { veredito: "phishing", nota: 85, resumo: "x" }],
    ["mais de 6 indícios", { ...valido, indicios: Array(7).fill(INDICIO) }],
    ["veredito que não combina com a nota", { ...valido, nota: 10 }],
  ])("recusa %s", (_, dados) => {
    expect(resultadoSchema.safeParse(dados).success).toBe(false);
  });
});

describe("normalizarResultado", () => {
  const base = { veredito: "phishing" as const, nota: 90, resumo: "Golpe." };

  test("a nota prevalece quando o veredito do modelo não combina", () => {
    const r = normalizarResultado({ veredito: "seguro", nota: 82, resumo: "Resumo." }, EMAIL);
    expect(r.veredito).toBe("phishing");
    expect(r.nota).toBe(82);
  });

  test("limita a nota entre 0 e 100", () => {
    expect(normalizarResultado({ ...base, nota: 140 }, EMAIL).nota).toBe(100);
    expect(normalizarResultado({ ...base, nota: -5 }, EMAIL).nota).toBe(0);
  });

  test("sem indícios do modelo, devolve lista vazia", () => {
    expect(normalizarResultado(base, EMAIL).indicios).toEqual([]);
  });

  test("preenche a origem como 'ia'", () => {
    const { origem, ...doModelo } = INDICIO;
    void origem;
    const r = normalizarResultado({ ...base, indicios: [doModelo] }, EMAIL);
    expect(r.indicios).toEqual([INDICIO]);
  });

  test("descarta indícios inválidos sem quebrar a análise", () => {
    const r = normalizarResultado(
      {
        ...base,
        indicios: [
          { titulo: "Sem gravidade", explicacao: "x", trecho: null },
          { titulo: "", explicacao: "Vazio.", gravidade: "atencao", trecho: null },
          { titulo: "Gravidade errada", explicacao: "x", gravidade: "media", trecho: null },
          "texto solto",
          null,
          42,
          { titulo: "Válido", explicacao: "Ok.", gravidade: "atencao", trecho: null },
        ],
      },
      EMAIL,
    );
    expect(r.indicios.map((i) => i.titulo)).toEqual(["Válido"]);
  });

  test("troca por null um trecho que não existe no e-mail", () => {
    const r = normalizarResultado(
      {
        ...base,
        indicios: [
          { titulo: "Inventado", explicacao: "x.", gravidade: "critico", trecho: "digite seu PIN aqui" },
          { titulo: "Resumido", explicacao: "x.", gravidade: "critico", trecho: "pede a senha do banco" },
        ],
      },
      EMAIL,
    );
    expect(r.indicios.map((i) => i.trecho)).toEqual([null, null]);
  });

  test("aceita o trecho ignorando maiúsculas e espaços repetidos", () => {
    const r = normalizarResultado(
      {
        ...base,
        indicios: [
          { titulo: "Senha", explicacao: "x.", gravidade: "critico", trecho: "CONFIRME SUA SENHA" },
          { titulo: "Assunto", explicacao: "x.", gravidade: "atencao", trecho: "urgente:  sua conta\nfoi bloqueada" },
        ],
      },
      EMAIL,
    );
    expect(r.indicios.map((i) => i.trecho)).toEqual([
      "CONFIRME SUA SENHA",
      "urgente:  sua conta\nfoi bloqueada",
    ]);
  });

  test("corta a explicação nas 3 primeiras frases", () => {
    const r = normalizarResultado(
      {
        ...base,
        indicios: [
          {
            titulo: "Longo",
            explicacao: "Primeira. Segunda. Terceira. Quarta. Quinta.",
            gravidade: "atencao",
            trecho: null,
          },
        ],
      },
      EMAIL,
    );
    expect(r.indicios[0].explicacao).toBe("Primeira. Segunda. Terceira.");
  });

  test("limita a 6 indícios e ordena por gravidade (crítico, atenção, confiável)", () => {
    const ind = (titulo: string, gravidade: string) => ({
      titulo,
      explicacao: "x.",
      gravidade,
      trecho: null,
    });
    const r = normalizarResultado(
      {
        ...base,
        indicios: [
          ind("c1", "confiavel"),
          ind("a1", "atencao"),
          ind("k1", "critico"),
          ind("c2", "confiavel"),
          ind("a2", "atencao"),
          ind("k2", "critico"),
          ind("c3", "confiavel"),
          ind("k3", "critico"),
        ],
      },
      EMAIL,
    );
    expect(r.indicios.map((i) => i.titulo)).toEqual(["k1", "k2", "k3", "a1", "a2", "c1"]);
  });
});

describe("cortarTrecho", () => {
  test("corta em até 120 caracteres sem partir palavras nem números", () => {
    const longo =
      "preencher seus dados com nome completo, CPF e número do cartão de crédito para pagamento da taxa de liberação de R$ 49,90. Depois";
    const cortado = cortarTrecho(longo);
    expect(cortado.length).toBeLessThanOrEqual(120);
    expect(longo.startsWith(cortado)).toBe(true);
    expect(cortado.endsWith("R$")).toBe(true);
    expect(cortado).not.toContain("49,9");
  });

  test("trecho curto continua igual", () => {
    expect(cortarTrecho("  confirme sua senha  ")).toBe("confirme sua senha");
  });

  test("um trecho longo cortado continua sendo encontrado no e-mail", () => {
    const email = `Olá! ${"palavra ".repeat(30)}fim.`;
    const r = normalizarResultado(
      {
        veredito: "seguro",
        nota: 5,
        resumo: "Ok.",
        indicios: [
          { titulo: "Longo", explicacao: "x.", gravidade: "confiavel", trecho: `${"palavra ".repeat(30)}fim.` },
        ],
      },
      email,
    );
    expect(r.indicios[0].trecho).not.toBeNull();
    expect(r.indicios[0].trecho!.length).toBeLessThanOrEqual(120);
  });
});

describe("trechoExiste e ordenarIndicios", () => {
  test("trechoExiste ignora maiúsculas e espaços repetidos", () => {
    expect(trechoExiste("SUA SENHA", EMAIL)).toBe(true);
    expect(trechoExiste("sua senha em", EMAIL)).toBe(true);
    expect(trechoExiste("sua senha agora", EMAIL)).toBe(false);
    expect(trechoExiste("   ", EMAIL)).toBe(false);
  });

  test("ordenarIndicios mantém a ordem dentro da mesma gravidade", () => {
    const lista = [
      { id: 1, gravidade: "atencao" },
      { id: 2, gravidade: "critico" },
      { id: 3, gravidade: "atencao" },
      { id: 4, gravidade: "confiavel" },
      { id: 5, gravidade: "critico" },
    ] as const;
    expect(ordenarIndicios(lista).map((i) => i.id)).toEqual([2, 5, 1, 3, 4]);
  });
});

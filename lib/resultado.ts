import { z } from "zod";
import { nivelPorNota, type Nivel } from "@/lib/nivel";

export const VEREDITOS = ["seguro", "suspeito", "phishing"] as const;
export type Veredito = (typeof VEREDITOS)[number];

const VEREDITO_POR_NIVEL: Record<Nivel, Veredito> = {
  baixo: "seguro",
  medio: "suspeito",
  alto: "phishing",
};

/**
 * Regra de coerência: 0–39 seguro, 40–69 suspeito, 70–100 phishing.
 * As faixas vêm de `nivelPorNota` (lib/nivel.ts), a fonte única da regra.
 */
export function vereditoPorNota(nota: number): Veredito {
  return VEREDITO_POR_NIVEL[nivelPorNota(nota)];
}

// ---------------------------------------------------------------------------
// Indícios
// ---------------------------------------------------------------------------

/** Ordem de exibição: crítico, atenção, confiável. */
export const GRAVIDADES = ["critico", "atencao", "confiavel"] as const;
export type Gravidade = (typeof GRAVIDADES)[number];

/** "ia" = gerado pelo Gemini; "links" = verificação de links (História 6). */
export const ORIGENS = ["ia", "links"] as const;

export const MIN_INDICIOS_PEDIDOS = 2;
export const MAX_INDICIOS = 6;
export const MAX_TITULO = 80; // pedimos ~60 ao modelo; 80 é o teto aceito
export const MAX_FRASES = 3;
export const MAX_TRECHO = 120;

/**
 * Conta frases: termina em . ! ? ou … seguido de espaço e de letra
 * maiúscula (ou aspas/parêntese). Assim "R$ 1.500,00" e "e-mail." no meio
 * do texto não contam como fim de frase.
 */
const FIM_DE_FRASE = /(?<=[.!?…])\s+(?=["“(]?[A-ZÀ-Ý])/u;

export function separarFrases(texto: string): string[] {
  return texto
    .trim()
    .split(FIM_DE_FRASE)
    .map((f) => f.trim())
    .filter(Boolean);
}

/**
 * Indício: um sinal encontrado no e-mail, explicado em linguagem simples.
 * Usado também pelas Histórias 5 (trechos destacados) e 6 (verificação de links).
 */
export const indicioSchema = z.object({
  /** Curto, até ~60 caracteres. */
  titulo: z.string().trim().min(1).max(MAX_TITULO),
  /** De 1 a 3 frases, linguagem do dia a dia, falando com "você". */
  explicacao: z
    .string()
    .trim()
    .min(1)
    .refine((t) => separarFrases(t).length <= MAX_FRASES, {
      error: `A explicação deve ter no máximo ${MAX_FRASES} frases.`,
    }),
  gravidade: z.enum(GRAVIDADES),
  /** Cópia EXATA de um pedaço do e-mail (até 120 caracteres), ou null. */
  trecho: z.string().min(1).max(MAX_TRECHO).nullable(),
  origem: z.enum(ORIGENS),
});

export type Indicio = z.infer<typeof indicioSchema>;

/** Formato final devolvido pela rota /api/analisar. */
export const resultadoSchema = z
  .object({
    veredito: z.enum(VEREDITOS),
    nota: z.number().int().min(0).max(100),
    resumo: z.string().trim().min(1),
    indicios: z.array(indicioSchema).max(MAX_INDICIOS),
  })
  .refine((r) => r.veredito === vereditoPorNota(r.nota), {
    error: "O veredito não combina com a nota de risco.",
    path: ["veredito"],
  });

export type Resultado = z.infer<typeof resultadoSchema>;

/** Indício como o modelo devolve (sem `origem`, que o código preenche). */
export const indicioModeloSchema = indicioSchema.omit({ origem: true });
export type IndicioModelo = z.infer<typeof indicioModeloSchema>;

/**
 * Formato pedido ao modelo (saída estruturada). Os indícios entram como
 * `unknown` de propósito: um indício malformado é descartado em
 * normalizarResultado, sem derrubar a análise inteira.
 */
export const respostaModeloSchema = z.object({
  veredito: z.enum(VEREDITOS),
  nota: z.number().int(),
  resumo: z.string(),
  indicios: z.array(z.unknown()).optional(),
});

export type RespostaModelo = z.infer<typeof respostaModeloSchema>;

/** Compara ignorando maiúsculas e espaços repetidos. */
function paraComparar(texto: string): string {
  return texto.toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
}

/** O trecho existe no e-mail? (ignora maiúsculas e espaços repetidos) */
export function trechoExiste(trecho: string, textoEmail: string): boolean {
  const alvo = paraComparar(trecho);
  return alvo.length > 0 && paraComparar(textoEmail).includes(alvo);
}

/**
 * Corta um trecho longo em até 120 caracteres sem partir palavras ou
 * números ao meio (volta até o último espaço). O começo do trecho continua
 * sendo uma cópia exata do e-mail.
 */
export function cortarTrecho(trecho: string): string {
  const limpo = trecho.trim();
  if (limpo.length <= MAX_TRECHO) return limpo;
  const corte = limpo.slice(0, MAX_TRECHO + 1);
  const ultimoEspaco = corte.search(/\s\S*$/);
  return (ultimoEspaco > 0 ? corte.slice(0, ultimoEspaco) : limpo.slice(0, MAX_TRECHO))
    .replace(/[\s,;:–-]+$/, "")
    .trim();
}

/** Ordena por gravidade (crítico, atenção, confiável), mantendo a ordem do modelo dentro de cada uma. */
export function ordenarIndicios<T extends { gravidade: Gravidade }>(
  indicios: readonly T[],
): T[] {
  return [...indicios].sort(
    (a, b) => GRAVIDADES.indexOf(a.gravidade) - GRAVIDADES.indexOf(b.gravidade),
  );
}

/**
 * Limpa um indício vindo do modelo. Devolve null se ele for inválido.
 * - corta a explicação nas 3 primeiras frases;
 * - corta o trecho em 120 caracteres (continua sendo uma cópia exata);
 * - troca por null um trecho que não exista no e-mail.
 */
function limparIndicio(
  bruto: unknown,
  textoEmail: string,
  origem: Indicio["origem"],
): Indicio | null {
  if (!bruto || typeof bruto !== "object") return null;
  const dados = bruto as Record<string, unknown>;

  const explicacao =
    typeof dados.explicacao === "string"
      ? separarFrases(dados.explicacao).slice(0, MAX_FRASES).join(" ")
      : dados.explicacao;

  let trecho = dados.trecho ?? null;
  if (typeof trecho === "string") {
    trecho = cortarTrecho(trecho);
    if (!trecho || !trechoExiste(trecho as string, textoEmail)) trecho = null;
  }

  const validado = indicioSchema.safeParse({
    titulo: dados.titulo,
    explicacao,
    gravidade: dados.gravidade,
    trecho,
    origem,
  });
  return validado.success ? validado.data : null;
}

/**
 * Converte a resposta do modelo no resultado final:
 * - limita a nota a 0–100 e, se o veredito não combinar com a nota, a nota prevalece;
 * - descarta indícios inválidos, limita a 6 e ordena por gravidade;
 * - confere cada trecho contra o texto do e-mail.
 *
 * PRIVACIDADE: o texto do e-mail é usado só aqui, em memória, para conferir
 * os trechos. Nunca é salvo nem registrado.
 */
export function normalizarResultado(
  resposta: RespostaModelo,
  textoEmail: string,
  origem: Indicio["origem"] = "ia",
): Resultado {
  const nota = Math.min(100, Math.max(0, Math.round(resposta.nota)));
  const indicios = ordenarIndicios(
    (resposta.indicios ?? [])
      .map((bruto) => limparIndicio(bruto, textoEmail, origem))
      .filter((i): i is Indicio => i !== null),
  ).slice(0, MAX_INDICIOS);

  return resultadoSchema.parse({
    veredito: vereditoPorNota(nota),
    nota,
    resumo: resposta.resumo,
    indicios,
  });
}

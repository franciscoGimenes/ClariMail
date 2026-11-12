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

/**
 * Indício de risco. Fica vazio nesta sprint; será preenchido na Sprint 2.
 * O formato pode evoluir até lá.
 */
export const indicioSchema = z.object({
  titulo: z.string(),
  explicacao: z.string(),
});

/** Formato final devolvido pela rota /api/analisar. */
export const resultadoSchema = z
  .object({
    veredito: z.enum(VEREDITOS),
    nota: z.number().int().min(0).max(100),
    resumo: z.string().trim().min(1),
    indicios: z.array(indicioSchema),
  })
  .refine((r) => r.veredito === vereditoPorNota(r.nota), {
    error: "O veredito não combina com a nota de risco.",
    path: ["veredito"],
  });

export type Resultado = z.infer<typeof resultadoSchema>;

/**
 * Formato pedido ao modelo (saída estruturada). Não inclui `indicios`
 * nesta sprint, para o modelo não gastar tempo com eles.
 */
export const respostaModeloSchema = z.object({
  veredito: z.enum(VEREDITOS),
  nota: z.number().int(),
  resumo: z.string(),
});

export type RespostaModelo = z.infer<typeof respostaModeloSchema>;

/**
 * Converte a resposta do modelo no resultado final: limita a nota a 0–100 e,
 * se o veredito não combinar com a nota, a nota prevalece.
 */
export function normalizarResultado(resposta: RespostaModelo): Resultado {
  const nota = Math.min(100, Math.max(0, Math.round(resposta.nota)));
  return resultadoSchema.parse({
    veredito: vereditoPorNota(nota),
    nota,
    resumo: resposta.resumo,
    indicios: [],
  });
}

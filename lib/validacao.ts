import { z } from "zod";

/** Regras de entrada compartilhadas entre o formulário (cliente) e a rota (servidor). */
export const MAX_CARACTERES = 10_000;
export const MIN_CARACTERES = 30;

export const MENSAGENS_VALIDACAO = {
  vazio: "Cole o texto do e-mail no campo para podermos analisar.",
  curto: `O texto está muito curto. Cole o e-mail completo (pelo menos ${MIN_CARACTERES} caracteres), incluindo quem enviou e a mensagem.`,
  longo: `O texto passou do limite de ${MAX_CARACTERES.toLocaleString("pt-BR")} caracteres. Cole só o e-mail que você quer analisar.`,
  formato: "Não conseguimos ler o texto enviado. Tente colar o e-mail de novo.",
} as const;

export const entradaSchema = z.object({
  texto: z
    .string({ error: MENSAGENS_VALIDACAO.formato })
    .max(MAX_CARACTERES, { error: MENSAGENS_VALIDACAO.longo })
    .transform((texto) => texto.trim())
    .refine((texto) => texto.length > 0, { error: MENSAGENS_VALIDACAO.vazio })
    .refine((texto) => texto.length === 0 || texto.length >= MIN_CARACTERES, {
      error: MENSAGENS_VALIDACAO.curto,
    }),
}, { error: MENSAGENS_VALIDACAO.formato });

export type Entrada = z.infer<typeof entradaSchema>;

/**
 * Valida a entrada e devolve o texto limpo ou a primeira mensagem de erro,
 * já pronta para mostrar à pessoa. Nunca inclui o texto do e-mail no erro.
 */
export function validarEntrada(
  dados: unknown,
): { ok: true; texto: string } | { ok: false; erro: string } {
  const resultado = entradaSchema.safeParse(dados);
  if (resultado.success) return { ok: true, texto: resultado.data.texto };
  return {
    ok: false,
    erro: resultado.error.issues[0]?.message ?? MENSAGENS_VALIDACAO.formato,
  };
}

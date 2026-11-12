/**
 * Regra única de nota de risco → nível de risco.
 * Todo o resto do app (veredito, cores, textos) parte daqui.
 *
 *   0–39  → baixo  (veredito "seguro")
 *   40–69 → médio  (veredito "suspeito")
 *   70–100 → alto  (veredito "phishing")
 */
export const NIVEIS = ["baixo", "medio", "alto"] as const;
export type Nivel = (typeof NIVEIS)[number];

export const LIMITE_MEDIO = 40;
export const LIMITE_ALTO = 70;

export function nivelPorNota(nota: number): Nivel {
  if (nota >= LIMITE_ALTO) return "alto";
  if (nota >= LIMITE_MEDIO) return "medio";
  return "baixo";
}

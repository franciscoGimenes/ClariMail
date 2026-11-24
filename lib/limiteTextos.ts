/*
 * Textos e tipos do limite diário compartilhados entre o servidor
 * (rotas) e o navegador (EmailForm). Sem dependências de servidor.
 */

export type MotivoLimite = "limite_site" | "limite_ip";

export const MENSAGEM_LIMITE_DIARIO =
  "Chegamos ao limite de análises de hoje. O ClariMail volta a funcionar amanhã. Enquanto isso, desconfie de e-mails que pedem senha, códigos ou pagamento com urgência.";

/** Corpo da resposta 429 de /api/analisar. */
export type RespostaLimite = { motivo: MotivoLimite; mensagem: string };

/** Corpo da resposta de GET /api/limite. */
export type RespostaRestantes = { restantes: number };

/** "Você ainda pode fazer 1 análise hoje" / "... 5 análises hoje". */
export function textoRestantes(restantes: number): string {
  return `Você ainda pode fazer ${restantes} ${restantes === 1 ? "análise" : "análises"} hoje.`;
}

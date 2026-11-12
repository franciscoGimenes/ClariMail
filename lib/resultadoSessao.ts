import { resultadoSchema, type Resultado } from "@/lib/resultado";

/*
 * Guarda o RESULTADO da análise no sessionStorage para a página /resultado.
 * O texto do e-mail nunca é guardado aqui (nem na URL).
 * O sessionStorage é apagado quando a aba é fechada.
 */

const CHAVE = "clarimail:resultado";
const EVENTO = "clarimail:resultado-alterado";

export function salvarResultado(resultado: Resultado): void {
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify(resultado));
    window.dispatchEvent(new Event(EVENTO));
  } catch {
    // Armazenamento bloqueado (ex.: navegação privada restrita): segue sem salvar.
  }
}

/**
 * Apaga o resultado guardado. Não avisa os assinantes de propósito: é chamado
 * ao sair da tela de resultado, e avisar faria a tela redirecionar no meio da
 * navegação.
 */
export function limparResultado(): void {
  try {
    sessionStorage.removeItem(CHAVE);
  } catch {
    // Armazenamento bloqueado: não há nada para apagar.
  }
}

/** Devolve o JSON bruto (string estável, para o useSyncExternalStore). */
export function lerResultadoBruto(): string | null {
  try {
    return sessionStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}

export function interpretarResultado(bruto: string | null): Resultado | null {
  if (!bruto) return null;
  try {
    const validado = resultadoSchema.safeParse(JSON.parse(bruto));
    return validado.success ? validado.data : null;
  } catch {
    return null;
  }
}

export function assinarResultado(aoMudar: () => void): () => void {
  window.addEventListener(EVENTO, aoMudar);
  window.addEventListener("storage", aoMudar);
  return () => {
    window.removeEventListener(EVENTO, aoMudar);
    window.removeEventListener("storage", aoMudar);
  };
}

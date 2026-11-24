/*
 * Guarda o texto do e-mail e os trechos dos indícios SÓ NA MEMÓRIA da aba,
 * entre a página inicial e /resultado, para mostrar os trechos destacados
 * (História 5).
 *
 * PRIVACIDADE (regra do CLAUDE.md): o texto do e-mail — e também os trechos,
 * que são pedaços dele — NUNCA vão para sessionStorage, localStorage, cookies,
 * URL ou servidor (além da própria análise). Ficam numa variável deste
 * módulo, que some ao recarregar ou fechar a aba.
 */

export type AnaliseEmMemoria = {
  texto: string;
  /** Trecho de cada indício, na mesma ordem dos indícios do resultado. */
  trechos: (string | null)[];
};

let analise: AnaliseEmMemoria | null = null;
const ouvintes = new Set<() => void>();

export function guardarAnaliseEmMemoria(texto: string, trechos: (string | null)[]): void {
  analise = { texto, trechos: [...trechos] };
  for (const ouvinte of ouvintes) ouvinte();
}

/**
 * Apaga o texto e os trechos. Não avisa os assinantes de propósito: é chamado
 * ao sair da tela de resultado, e avisar faria a tela trocar a mensagem no
 * meio da navegação (o mesmo cuidado de limparResultado).
 */
export function limparAnaliseEmMemoria(): void {
  analise = null;
}

/** O que está em memória, ou null (depois de recarregar a página, por exemplo). */
export function lerAnaliseEmMemoria(): AnaliseEmMemoria | null {
  return analise;
}

/** Para useSyncExternalStore. */
export function assinarAnaliseEmMemoria(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

import type { Gravidade } from "@/lib/resultado";

/*
 * Marca no texto do e-mail os trechos dos indícios (História 5).
 * Só calcula posições: quem desenha é a tela, com elementos React (nunca HTML).
 */

/** Gravidades que viram destaque. "confiavel" não é destacado. */
export const GRAVIDADES_DESTACADAS = ["critico", "atencao"] as const;
type GravidadeDestacada = (typeof GRAVIDADES_DESTACADAS)[number];

const PESO: Record<GravidadeDestacada, number> = { critico: 0, atencao: 1 };

function ehDestacada(g: Gravidade): g is GravidadeDestacada {
  return (GRAVIDADES_DESTACADAS as readonly string[]).includes(g);
}

/**
 * Versão do texto para comparar (minúsculas e espaços repetidos viram um só),
 * guardando de onde veio cada caractere no texto original.
 */
function paraComparar(texto: string) {
  let normal = "";
  const origem: number[] = []; // origem[i] = posição no original do caractere i
  let emEspaco = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (/\s/.test(c)) {
      if (!emEspaco) {
        normal += " ";
        origem.push(i);
      }
      emEspaco = true;
      continue;
    }
    emEspaco = false;
    const minuscula = c.toLocaleLowerCase("pt-BR");
    // Mantém 1 caractere por posição (raro: letras que mudam de tamanho).
    normal += minuscula.length === 1 ? minuscula : c;
    origem.push(i);
  }
  return { normal, origem };
}

export type Intervalo = { inicio: number; fim: number };

/**
 * Onde o trecho aparece no texto (primeira ocorrência), ignorando maiúsculas
 * e espaços repetidos. `fim` é exclusivo. Devolve null se não encontrar.
 */
export function localizarTrecho(texto: string, trecho: string): Intervalo | null {
  const alvo = paraComparar(trecho.trim()).normal.trim();
  if (!alvo) return null;
  const { normal, origem } = paraComparar(texto);
  const posicao = normal.indexOf(alvo);
  if (posicao === -1) return null;
  const ultimo = posicao + alvo.length - 1;
  return { inicio: origem[posicao], fim: origem[ultimo] + 1 };
}

export type Pedaco =
  | { tipo: "texto"; texto: string }
  | {
      tipo: "destaque";
      texto: string;
      /** Posição do indício na lista (a mesma ordem mostrada na tela). */
      indice: number;
      gravidade: GravidadeDestacada;
    };

type ComTrecho = { gravidade: Gravidade; trecho: string | null };

/**
 * Divide o texto em pedaços normais e destacados.
 * - só "critico" e "atencao" são destacados;
 * - trecho não encontrado não é marcado;
 * - se dois trechos se sobrepõem, prevalece o mais grave (no empate, o que
 *   vem primeiro na lista).
 */
export function dividirEmPedacos(texto: string, indicios: readonly ComTrecho[]): Pedaco[] {
  const marcados = indicios
    .map((indicio, indice) => ({ indicio, indice }))
    .filter(({ indicio }) => indicio.trecho && ehDestacada(indicio.gravidade))
    .map(({ indicio, indice }) => ({
      indice,
      gravidade: indicio.gravidade as GravidadeDestacada,
      intervalo: localizarTrecho(texto, indicio.trecho!),
    }))
    .filter((m) => m.intervalo !== null)
    .sort((a, b) => PESO[a.gravidade] - PESO[b.gravidade] || a.indice - b.indice);

  // Dono de cada caractere: o primeiro (mais grave) que o reivindicar.
  const dono = new Array<number>(texto.length).fill(-1);
  for (const { indice, intervalo } of marcados) {
    for (let i = intervalo!.inicio; i < intervalo!.fim; i++) {
      if (dono[i] === -1) dono[i] = indice;
    }
  }
  const gravidadeDe = new Map(marcados.map((m) => [m.indice, m.gravidade]));

  const pedacos: Pedaco[] = [];
  let inicio = 0;
  for (let i = 1; i <= texto.length; i++) {
    if (i < texto.length && dono[i] === dono[inicio]) continue;
    const parte = texto.slice(inicio, i);
    const indice = dono[inicio];
    pedacos.push(
      indice === -1
        ? { tipo: "texto", texto: parte }
        : { tipo: "destaque", texto: parte, indice, gravidade: gravidadeDe.get(indice)! },
    );
    inicio = i;
  }
  return pedacos;
}

/** Índices dos indícios que ganharam pelo menos um destaque. */
export function indicesDestacados(pedacos: readonly Pedaco[]): Set<number> {
  return new Set(
    pedacos.flatMap((p) => (p.tipo === "destaque" ? [p.indice] : [])),
  );
}

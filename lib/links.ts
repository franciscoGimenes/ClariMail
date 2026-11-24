import { domainToUnicode } from "node:url";

/*
 * Análise dos links do e-mail, feita EM CÓDIGO (sem IA).
 *
 * SEGURANÇA: os links NUNCA são abertos. Nada aqui faz requisição de rede
 * nem resolução de DNS: só lemos o texto. `new URL()` e `domainToUnicode`
 * apenas interpretam a string. Um teste falha se este arquivo usar fetch.
 *
 * PRIVACIDADE: o texto do e-mail só é lido em memória; nada é salvo.
 */

// ---------------------------------------------------------------------------
// Tipo do indício
// ---------------------------------------------------------------------------

/**
 * Igual ao `indicioSchema` da História 4 (lib/resultado.ts na branch
 * feat/explicacao-indicios). Enquanto ela não estiver na main, o tipo fica
 * aqui. Depois do merge: trocar por `Indicio` de "@/lib/resultado".
 */
export type IndicioLinks = {
  titulo: string;
  explicacao: string;
  gravidade: "critico" | "atencao" | "confiavel";
  trecho: string | null;
  origem: "ia" | "links";
};

export const MAX_INDICIOS = 6;
const MAX_TRECHO = 120;

// ---------------------------------------------------------------------------
// Listas
// ---------------------------------------------------------------------------

export const ENCURTADORES = [
  "bit.ly",
  "bitly.com",
  "tinyurl.com",
  "cutt.ly",
  "is.gd",
  "v.gd",
  "t.co",
  "t.ly",
  "rebrand.ly",
  "encurtador.com.br",
  "l1nq.com",
  "shorturl.at",
  "ow.ly",
  "buff.ly",
  "tiny.cc",
  "rb.gy",
  "s.id",
  "goo.gl",
  "x.co",
];

export type Marca = {
  nome: string;
  /** Para frases: "do Itaú", "dos Correios", "da Caixa". */
  doNome: string;
  /** Pedaços que identificam a marca num endereço (sem acento, hífen ou ponto). */
  chaves: string[];
  /** Endereços oficiais (o primeiro é o sugerido para digitar). */
  oficiais: string[];
  /** Palavras comuns que contêm a chave mas não são a marca (ex.: Amazonas). */
  excecoes?: string[];
};

export const MARCAS: Marca[] = [
  { nome: "Itaú", doNome: "do Itaú", chaves: ["itau"], oficiais: ["itau.com.br"], excecoes: ["itauna", "itaugua"] },
  { nome: "Bradesco", doNome: "do Bradesco", chaves: ["bradesco"], oficiais: ["bradesco.com.br"] },
  { nome: "Santander", doNome: "do Santander", chaves: ["santander"], oficiais: ["santander.com.br"] },
  { nome: "Banco do Brasil", doNome: "do Banco do Brasil", chaves: ["bancodobrasil", "bancobrasil"], oficiais: ["bb.com.br"] },
  { nome: "Caixa", doNome: "da Caixa", chaves: ["caixa"], oficiais: ["caixa.gov.br"], excecoes: ["baixa", "faixa"] },
  { nome: "Nubank", doNome: "do Nubank", chaves: ["nubank"], oficiais: ["nubank.com.br"] },
  { nome: "Correios", doNome: "dos Correios", chaves: ["correios"], oficiais: ["correios.com.br"] },
  { nome: "Receita Federal", doNome: "da Receita Federal", chaves: ["receitafederal"], oficiais: ["gov.br"] },
  { nome: "gov.br", doNome: "do gov.br", chaves: ["govbr"], oficiais: ["gov.br"] },
  { nome: "Mercado Livre", doNome: "do Mercado Livre", chaves: ["mercadolivre", "mercadolibre"], oficiais: ["mercadolivre.com.br", "mercadolivre.com", "mercadolibre.com"] },
  { nome: "Mercado Pago", doNome: "do Mercado Pago", chaves: ["mercadopago"], oficiais: ["mercadopago.com.br", "mercadopago.com"] },
  { nome: "Magalu", doNome: "da Magalu", chaves: ["magalu", "magazineluiza"], oficiais: ["magazineluiza.com.br", "magalu.com.br", "magalu.com"] },
  { nome: "Netflix", doNome: "da Netflix", chaves: ["netflix"], oficiais: ["netflix.com"] },
  { nome: "Shopee", doNome: "da Shopee", chaves: ["shopee"], oficiais: ["shopee.com.br", "shopee.com"] },
  { nome: "Amazon", doNome: "da Amazon", chaves: ["amazon"], oficiais: ["amazon.com.br", "amazon.com", "amazonaws.com"], excecoes: ["amazonas", "amazonia"] },
];

/** Sufixos públicos de dois níveis (o "nome" do site fica logo antes deles). */
const SUFIXOS_DUPLOS = new Set([
  "com.br", "net.br", "org.br", "gov.br", "edu.br", "art.br", "blog.br", "app.br",
  "ind.br", "inf.br", "mil.br", "jus.br", "leg.br", "mp.br", "tur.br", "eco.br",
  "emp.br", "srv.br", "tv.br", "nom.br", "adv.br", "med.br", "eng.br", "coop.br",
  "co.uk", "org.uk", "com.ar", "com.mx", "com.pt", "co.jp", "com.au",
]);

/** Terminações aceitas para endereços "soltos" (sem http:// nem www.). */
const TERMINACOES = [
  "com", "net", "org", "br", "info", "biz", "io", "co", "me", "app", "dev",
  "xyz", "top", "online", "site", "club", "shop", "store", "link", "click",
  "live", "life", "tech", "website", "space", "fun", "icu", "vip", "cc", "ws",
  "tk", "ml", "ga", "cf", "gq", "ru", "cn", "pt", "us", "uk", "ly",
  "gd", "at", "gy", "id", "example", "test",
];

// ---------------------------------------------------------------------------
// Extração
// ---------------------------------------------------------------------------

const REGEX_LINK = new RegExp(
  String.raw`(?<![@\w.-])(?:https?:\/\/[^\s<>"'\x60]+|www\.[^\s<>"'\x60]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:${TERMINACOES.join("|")})(?![\w-])(?:[\/?#][^\s<>"'\x60]*)?)`,
  "giu",
);

export type LinkEncontrado = {
  /** O link exatamente como aparece no texto. */
  texto: string;
  /** Nome do site, em minúsculas (letras de outro alfabeto viram "xn--"). */
  host: string;
};

/** Tira pontuação que costuma colar no fim do link ("acesse site.com.br."). */
function limparFim(link: string): string {
  let limpo = link.replace(/[.,;:!?'"”’»]+$/u, "");
  // Parêntese/colchete de fechamento sem o de abertura também sai.
  while (/[)\]}>]$/.test(limpo)) {
    const fecha = limpo.at(-1)!;
    const abre = { ")": "(", "]": "[", "}": "{", ">": "<" }[fecha]!;
    if (limpo.split(abre).length >= limpo.split(fecha).length) break;
    limpo = limpo.slice(0, -1).replace(/[.,;:!?]+$/, "");
  }
  return limpo;
}

/** Interpreta o link só como texto (sem abrir) e devolve o nome do site. */
export function hostDoLink(link: string): string | null {
  try {
    const comEsquema = /^https?:\/\//i.test(link) ? link : `http://${link}`;
    const host = new URL(comEsquema).hostname.toLowerCase().replace(/\.$/, "");
    return host || null;
  } catch {
    return null;
  }
}

export function extrairLinks(texto: string): LinkEncontrado[] {
  const vistos = new Set<string>();
  const links: LinkEncontrado[] = [];
  for (const achado of texto.matchAll(REGEX_LINK)) {
    const limpo = limparFim(achado[0]);
    if (vistos.has(limpo)) continue;
    const host = hostDoLink(limpo);
    if (!host || !host.includes(".") && !host.startsWith("[")) continue;
    vistos.add(limpo);
    links.push({ texto: limpo, host });
  }
  return links;
}

/** Domínio do remetente, a partir de "De:", "From:" ou "Remetente:". */
export function extrairRemetente(texto: string): string | null {
  const linha = texto.match(/^[ \t>]*(?:de|from|remetente)[ \t]*:[ \t]*(.+)$/im);
  const email = linha?.[1].match(/[\w.+-]+@((?:[\w-]+\.)+[\w-]+)/);
  return email ? email[1].toLowerCase() : null;
}

// ---------------------------------------------------------------------------
// Regras auxiliares
// ---------------------------------------------------------------------------

/**
 * Domínio registrável: o nome do site + terminação.
 * "www.loja.com.br" e "email.loja.com.br" -> "loja.com.br".
 */
export function dominioRegistravel(host: string): string {
  const partes = host.split(".");
  if (partes.length <= 2) return host;
  const ultimosDois = partes.slice(-2).join(".");
  const tamanho = SUFIXOS_DUPLOS.has(ultimosDois) ? 3 : 2;
  return partes.slice(-tamanho).join(".");
}

/** O nome do site sem a terminação: "itau-atendimento.net.br" -> "itau-atendimento". */
function nomeDoSite(host: string): string {
  const registravel = dominioRegistravel(host);
  return registravel.split(".")[0];
}

function ehIp(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[");
}

function ehOficial(host: string, marca: Marca): boolean {
  return marca.oficiais.some((o) => host === o || host.endsWith(`.${o}`));
}

function ehDeAlgumaMarca(host: string): boolean {
  return MARCAS.some((m) => ehOficial(host, m));
}

/** Letras de outros alfabetos que imitam as nossas (а cirílico -> a etc.). */
const PARECIDAS: Record<string, string> = {
  а: "a", е: "e", о: "o", р: "p", с: "c", х: "x", у: "y", і: "i", ј: "j", ѕ: "s",
  ԁ: "d", һ: "h", ɡ: "g", ı: "i", ο: "o", α: "a", ν: "v", τ: "t", ρ: "p", κ: "k",
};

/** Só letras e números, sem acento, hífen ou ponto. */
function compactar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Variações com os truques de troca de caracteres desfeitos. */
function variacoesSemTruques(texto: string): string[] {
  const base = texto.replace(/rn/g, "m").replace(/vv/g, "w").replace(/0/g, "o");
  return [...new Set([base.replace(/1/g, "l"), base.replace(/1/g, "i")])];
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) {
      atual[j] = Math.min(
        anterior[j] + 1,
        atual[j - 1] + 1,
        anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    anterior = atual;
  }
  return anterior[b.length];
}

type MarcaImitada = { marca: Marca; jeito: "contem" | "caracteres" | "letras" };

/** O endereço imita uma marca conhecida sem ser o site oficial dela? */
export function marcaImitada(host: string): MarcaImitada | null {
  // Letras de outro alfabeto: compara a versão "desdisfarçada".
  let legivel = host;
  if (host.includes("xn--")) {
    legivel = [...domainToUnicode(host)].map((c) => PARECIDAS[c] ?? c).join("");
  }
  const tudo = compactar(legivel);
  const nome = compactar(nomeDoSite(legivel));

  for (const marca of MARCAS) {
    if (ehOficial(host, marca)) continue;
    const temExcecao = (t: string) => marca.excecoes?.some((e) => t.includes(e));

    for (const chave of marca.chaves) {
      if (tudo.includes(chave) && !temExcecao(tudo)) return { marca, jeito: "contem" };
      if (
        variacoesSemTruques(tudo).some((v) => v !== tudo && v.includes(chave) && !temExcecao(v))
      ) {
        return { marca, jeito: "caracteres" };
      }
      // Diferença de 1 letra (marcas curtas) ou 2 letras (marcas longas).
      const limite = chave.length <= 5 ? 1 : 2;
      const distancia = levenshtein(nome, chave);
      if (distancia > 0 && distancia <= limite && !temExcecao(nome)) {
        return { marca, jeito: "letras" };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Análise
// ---------------------------------------------------------------------------

export type ProblemaLink =
  | { tipo: "marca"; marca: Marca; jeito: MarcaImitada["jeito"] }
  | { tipo: "ip" }
  | { tipo: "letras_disfarcadas" }
  | { tipo: "encurtador" }
  | { tipo: "outro_site"; remetente: string; site: string };

/** Do mais grave para o menos grave. */
const PRIORIDADE: ProblemaLink["tipo"][] = [
  "marca",
  "ip",
  "letras_disfarcadas",
  "encurtador",
  "outro_site",
];

export type LinkAnalisado = LinkEncontrado & { problemas: ProblemaLink[] };

export function problemasDoLink(link: LinkEncontrado, remetente: string | null): ProblemaLink[] {
  const { host } = link;
  const problemas: ProblemaLink[] = [];

  if (ehIp(host)) {
    problemas.push({ tipo: "ip" });
  } else {
    const imitada = marcaImitada(host);
    if (imitada) problemas.push({ tipo: "marca", ...imitada });
    if (host.split(".").some((parte) => parte.startsWith("xn--")) && !imitada) {
      problemas.push({ tipo: "letras_disfarcadas" });
    }
    if (ENCURTADORES.includes(dominioRegistravel(host)) || ENCURTADORES.includes(host)) {
      problemas.push({ tipo: "encurtador" });
    }
  }

  if (remetente) {
    const doRemetente = dominioRegistravel(remetente);
    const doLink = ehIp(host) ? host : dominioRegistravel(host);
    // Site oficial de marca conhecida (ex.: rastreio nos Correios) não conta.
    if (doLink !== doRemetente && !ehDeAlgumaMarca(host)) {
      problemas.push({ tipo: "outro_site", remetente: doRemetente, site: doLink });
    }
  }

  return problemas.sort((a, b) => PRIORIDADE.indexOf(a.tipo) - PRIORIDADE.indexOf(b.tipo));
}

/** Um indício por link, com a explicação do problema mais grave. */
export function indicioDoLink(link: LinkAnalisado): IndicioLinks | null {
  const [principal] = link.problemas;
  if (!principal) return null;
  const trecho = link.texto.slice(0, MAX_TRECHO);
  const base = { trecho, origem: "links" as const };

  switch (principal.tipo) {
    case "marca": {
      const { marca } = principal;
      const oficial = marca.oficiais[0];
      return {
        ...base,
        gravidade: "critico",
        titulo: `Link que imita o site ${marca.doNome}`,
        explicacao: `O endereço real deste link é ${link.host}, que não é o site oficial ${marca.doNome} (${oficial}). Não clique nele; se precisar, digite ${oficial} no navegador.`,
      };
    }
    case "ip":
      return {
        ...base,
        gravidade: "critico",
        titulo: "Link com números no lugar do nome do site",
        explicacao: `Este link leva para ${link.host}, um endereço feito só de números, sem o nome de nenhuma empresa. Bancos e lojas de verdade não usam endereços assim. Não clique nele.`,
      };
    case "letras_disfarcadas":
      return {
        ...base,
        gravidade: "critico",
        titulo: "Link com letras disfarçadas",
        explicacao:
          "O endereço deste link usa letras de outro alfabeto que parecem iguais às nossas, um truque para imitar sites conhecidos. Não clique nele.",
      };
    case "encurtador":
      return {
        ...base,
        gravidade: "atencao",
        titulo: "Link encurtado esconde o endereço",
        explicacao: `Este link usa um encurtador (${dominioRegistravel(link.host)}), que esconde para onde ele leva de verdade. Golpistas usam isso para disfarçar sites falsos. Só abra se você confiar em quem mandou.`,
      };
    case "outro_site":
      return {
        ...base,
        gravidade: "atencao",
        titulo: "Link leva a um site diferente de quem enviou",
        explicacao: `O e-mail diz vir de ${principal.remetente}, mas este link leva para ${principal.site}. Confira se esse site é mesmo da empresa antes de clicar.`,
      };
  }
}

export type AnaliseLinks = {
  remetente: string | null;
  links: LinkAnalisado[];
  indicios: IndicioLinks[];
};

/** Analisa os links do e-mail. Só lê o texto: nenhum link é aberto. */
export function analisarLinks(texto: string): AnaliseLinks {
  const remetente = extrairRemetente(texto);
  const links = extrairLinks(texto).map((link) => ({
    ...link,
    problemas: problemasDoLink(link, remetente),
  }));
  const indicios = links
    .map(indicioDoLink)
    .filter((i): i is IndicioLinks => i !== null);
  return { remetente, links, indicios };
}

// ---------------------------------------------------------------------------
// Integração com a IA
// ---------------------------------------------------------------------------

/** Deixa só caracteres de endereço (nada do e-mail vira instrução para a IA). */
function seguro(host: string): string {
  return host.replace(/[^a-z0-9.\-:[\]]/gi, "").slice(0, 100);
}

const DESCRICAO: Record<ProblemaLink["tipo"], (p: ProblemaLink) => string> = {
  marca: (p) => {
    const { marca } = p as Extract<ProblemaLink, { tipo: "marca" }>;
    return `imita o site ${marca.doNome}, mas não é o oficial (${marca.oficiais[0]})`;
  },
  ip: () => "usa números no lugar do nome do site",
  letras_disfarcadas: () => "usa letras de outro alfabeto que imitam as nossas",
  encurtador: () => "é um link encurtado, que esconde o endereço real",
  outro_site: (p) => {
    const { remetente } = p as Extract<ProblemaLink, { tipo: "outro_site" }>;
    return `leva a um site diferente do remetente (${seguro(remetente)})`;
  },
};

/**
 * Resumo dos achados para mandar ao Gemini, FORA do bloco <email>.
 * Só usa nomes de sites (com caracteres filtrados), nunca outros trechos do e-mail.
 */
export function resumoParaIa(analise: AnaliseLinks): string {
  const titulo =
    "Sinais já verificados nos links (verificação automática do ClariMail, feita sem abrir os links):";
  if (analise.links.length === 0) return `${titulo}\n- O e-mail não tem links.`;
  const linhas = analise.links.map((link) => {
    const descricoes = link.problemas.map((p) => DESCRICAO[p.tipo](p));
    return `- ${seguro(link.host)}: ${descricoes.length ? descricoes.join("; ") : "nenhum problema encontrado"}.`;
  });
  // Vários links para o mesmo site com o mesmo achado viram uma linha só.
  return [titulo, ...new Set(linhas)].join("\n");
}

type IndicioQualquer = {
  titulo: string;
  explicacao: string;
  gravidade?: string;
  trecho?: string | null;
};

const ORDEM_GRAVIDADE: Record<string, number> = { critico: 0, atencao: 1, confiavel: 2 };

/**
 * Junta os indícios dos links com os da IA:
 * - descarta o indício da IA que fala do mesmo link (o dos links é mais preciso);
 * - ordena por gravidade (os dos links primeiro em caso de empate);
 * - limita a 6.
 */
export function juntarIndicios<T extends IndicioQualquer>(
  daIa: readonly T[],
  deLinks: readonly IndicioLinks[],
): (T | IndicioLinks)[] {
  const linksTexto = deLinks.map((i) => i.trecho?.toLowerCase()).filter(Boolean) as string[];
  const mesmoLink = (indicio: T) => {
    const trecho = indicio.trecho?.toLowerCase();
    return !!trecho && linksTexto.some((l) => trecho.includes(l) || l.includes(trecho));
  };
  const rank = (i: IndicioQualquer) => ORDEM_GRAVIDADE[i.gravidade ?? "atencao"] ?? 1;

  return [...deLinks, ...daIa.filter((i) => !mesmoLink(i))]
    .map((indicio, posicao) => ({ indicio, posicao }))
    .sort((a, b) => rank(a.indicio) - rank(b.indicio) || a.posicao - b.posicao)
    .map(({ indicio }) => indicio)
    .slice(0, MAX_INDICIOS);
}

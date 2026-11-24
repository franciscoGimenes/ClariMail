import {
  normalizarResultado,
  type Gravidade,
  type Resultado,
} from "@/lib/resultado";

/**
 * Analisador de SIMULAÇÃO, usado só em desenvolvimento quando não há
 * GEMINI_API_KEY. Regras simples, apenas para o time testar o fluxo.
 * Não é uma análise de verdade.
 */

type Regra = {
  pontos: number;
  padrao: RegExp;
  indicio: { titulo: string; explicacao: string; gravidade: Gravidade };
};

const REGRAS: Regra[] = [
  {
    pontos: 35,
    padrao:
      /\b(senha|cpf|cart[aã]o de cr[eé]dito|n[uú]mero do cart[aã]o|c[oó]digo de (seguran[cç]a|verifica[cç][aã]o)|token|dados banc[aá]rios|ag[eê]ncia e conta)\b/i,
    indicio: {
      titulo: "Pede dados pessoais ou senha",
      explicacao:
        "Empresas sérias não pedem senha, códigos ou dados do cartão por e-mail. Não responda e não informe nada.",
      gravidade: "critico",
    },
  },
  {
    pontos: 15,
    padrao:
      /https?:\/\/(\d{1,3}\.){3}\d{1,3}|\b(bit\.ly|tinyurl|encurta|cutt\.ly)\b|https?:\/\/[^\s/]+\.(xyz|top|click|info|online|site)\b/i,
    indicio: {
      titulo: "Link com endereço estranho",
      explicacao:
        "O link leva para um endereço que não parece ser o site oficial da empresa. Não clique nele.",
      gravidade: "critico",
    },
  },
  {
    pontos: 15,
    padrao: /\b(taxa|pix|boleto|pagamento pendente|regularizar|liberar)\b/i,
    indicio: {
      titulo: "Pede pagamento para resolver algo",
      explicacao:
        "Golpes costumam cobrar uma taxa para liberar uma entrega ou resolver um problema. Confirme pelo canal oficial antes de pagar.",
      gravidade: "critico",
    },
  },
  {
    pontos: 20,
    padrao:
      /\b(urgente|imediatamente|ainda hoje|em at[eé] \d+ ?(horas|h)|[uú]ltimo aviso|bloquead[oa]|suspens[ao]|cancelad[oa]|expira|prazo final)\b/i,
    indicio: {
      titulo: "Cria pressa ou ameaça",
      explicacao:
        "A mensagem tenta apressar você com prazo curto ou ameaça. Quem aplica golpe quer que você aja sem pensar.",
      gravidade: "atencao",
    },
  },
  {
    pontos: 25,
    padrao:
      /\b(parab[eé]ns|voc[eê] (foi sorteado|ganhou)|sorteado|pr[eê]mio|gr[aá]tis|resgat(e|ar))\b/i,
    indicio: {
      titulo: "Oferta boa demais",
      explicacao:
        "Prêmios e sorteios que você não pediu são uma isca comum. Desconfie de qualquer pedido para resgatar algo.",
      gravidade: "atencao",
    },
  },
  {
    pontos: 10,
    padrao: /https?:\/\/\S+|www\.\S+/i,
    indicio: {
      titulo: "Tem link para clicar",
      explicacao:
        "Antes de clicar, confira se o endereço é mesmo o da empresa. Na dúvida, digite o site oficial no navegador.",
      gravidade: "atencao",
    },
  },
];

/** Sinais de confiança, usados quando o e-mail não tem os sinais de risco. */
const SINAIS_DE_CONFIANCA = [
  {
    regra: 0,
    titulo: "Não pede senha nem dados",
    explicacao:
      "A mensagem não pede senha, códigos ou dados do cartão. Isso é o esperado de um e-mail verdadeiro.",
  },
  {
    regra: 3,
    titulo: "Sem pressa nem ameaça",
    explicacao:
      "O e-mail não tenta assustar você nem dá prazos curtos. Mensagens verdadeiras costumam ser calmas assim.",
  },
  {
    regra: 2,
    titulo: "Não pede pagamento",
    explicacao: "Não há cobrança de taxa nem pedido de Pix ou boleto.",
  },
];

const RESUMOS: Record<Resultado["veredito"], string> = {
  phishing:
    "Este e-mail tem vários sinais de golpe, como pressa ou pedido de dados pessoais. Não clique em nenhum link e não responda.",
  suspeito:
    "Este e-mail tem alguns sinais que pedem cuidado. Antes de fazer qualquer coisa, confirme com a empresa pelos canais oficiais.",
  seguro:
    "Não encontramos sinais comuns de golpe neste e-mail. Mesmo assim, desconfie se ele pedir senha ou dinheiro.",
};

/** A linha do e-mail onde o sinal aparece, cortada em até 120 caracteres. */
function trechoDaLinha(texto: string, inicio: number): string {
  const comecoLinha = texto.lastIndexOf("\n", inicio) + 1;
  const fimLinha = texto.indexOf("\n", inicio);
  const linha = texto.slice(comecoLinha, fimLinha === -1 ? undefined : fimLinha);
  const posicao = inicio - comecoLinha;
  const janela =
    linha.length <= 120 ? linha : linha.slice(Math.max(0, posicao - 40), Math.max(0, posicao - 40) + 120);
  return janela.trim();
}

export function analisarSimulado(texto: string): Resultado {
  const encontradas = REGRAS.map((regra) => ({ regra, achado: regra.padrao.exec(texto) }));

  const nota = Math.min(
    100,
    encontradas.reduce((total, { regra, achado }) => (achado ? total + regra.pontos : total), 0),
  );
  const veredito = nota >= 70 ? "phishing" : nota >= 40 ? "suspeito" : "seguro";

  const indicios: unknown[] = encontradas
    .filter(({ achado }) => achado)
    .map(({ regra, achado }) => ({
      ...regra.indicio,
      trecho: trechoDaLinha(texto, achado!.index) || null,
    }));

  // E-mail seguro: os indícios também mostram os sinais de confiança
  // (as regras de risco que NÃO apareceram).
  for (const sinal of veredito === "seguro" ? SINAIS_DE_CONFIANCA : []) {
    if (!encontradas[sinal.regra].achado && indicios.length < 6) {
      indicios.push({
        titulo: sinal.titulo,
        explicacao: sinal.explicacao,
        gravidade: "confiavel",
        trecho: null,
      });
    }
  }

  return normalizarResultado(
    {
      veredito,
      nota,
      resumo: `[Simulação] ${RESUMOS[veredito]}`,
      indicios,
    },
    texto,
  );
}

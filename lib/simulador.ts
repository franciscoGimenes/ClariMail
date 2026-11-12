import { normalizarResultado, type Resultado } from "@/lib/resultado";

/**
 * Analisador de SIMULAÇÃO, usado só em desenvolvimento quando não há
 * ANTHROPIC_API_KEY. Regras simples, apenas para o time testar o fluxo.
 * Não é uma análise de verdade.
 */

type Regra = { pontos: number; padrao: RegExp };

const REGRAS: Regra[] = [
  // Urgência e ameaça
  {
    pontos: 20,
    padrao:
      /\b(urgente|imediatamente|ainda hoje|em at[eé] \d+ ?(horas|h)|[uú]ltimo aviso|bloquead[oa]|suspens[ao]|cancelad[oa]|expira|prazo final)\b/i,
  },
  // Pedido de senha, CPF, cartão ou dados bancários
  {
    pontos: 35,
    padrao:
      /\b(senha|cpf|cart[aã]o de cr[eé]dito|n[uú]mero do cart[aã]o|c[oó]digo de (seguran[cç]a|verifica[cç][aã]o)|token|dados banc[aá]rios|ag[eê]ncia e conta)\b/i,
  },
  // Pedido de pagamento ou taxa
  {
    pontos: 15,
    padrao: /\b(taxa|pix|boleto|pagamento pendente|regularizar|liberar)\b/i,
  },
  // Ofertas boas demais
  {
    pontos: 25,
    padrao:
      /\b(parab[eé]ns|voc[eê] (foi sorteado|ganhou)|sorteado|pr[eê]mio|gr[aá]tis|resgat(e|ar))\b/i,
  },
  // Links
  { pontos: 10, padrao: /https?:\/\/|www\./i },
  // Links com número no lugar do site, encurtador ou terminação incomum
  {
    pontos: 15,
    padrao:
      /https?:\/\/(\d{1,3}\.){3}\d{1,3}|\b(bit\.ly|tinyurl|encurta|cutt\.ly)\b|https?:\/\/[^\s/]+\.(xyz|top|click|info|online|site)\b/i,
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

export function analisarSimulado(texto: string): Resultado {
  const nota = REGRAS.reduce(
    (total, regra) => (regra.padrao.test(texto) ? total + regra.pontos : total),
    0,
  );
  const limitada = Math.min(100, nota);
  const veredito =
    limitada >= 70 ? "phishing" : limitada >= 40 ? "suspeito" : "seguro";
  return normalizarResultado({
    veredito,
    nota: limitada,
    resumo: `[Simulação] ${RESUMOS[veredito]}`,
  });
}

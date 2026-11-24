import { analisarEmail, ErroAnalise, escolherModo } from "@/lib/analisador";
import { analisarLinks, juntarIndicios, resumoParaIa } from "@/lib/links";
import {
  ErroConfiguracaoLimite,
  ipDaRequisicao,
  obterLimitador,
} from "@/lib/limite";
import {
  MENSAGEM_LIMITE_DIARIO,
  type MotivoLimite,
  type RespostaLimite,
} from "@/lib/limiteTextos";
import { resultadoSchema } from "@/lib/resultado";
import { validarEntrada } from "@/lib/validacao";

/*
 * POST /api/analisar  { texto: string }  ->  Resultado
 *
 * PRIVACIDADE: o texto do e-mail nunca é salvo nem registrado em log.
 * Os logs abaixo registram só o tipo de falha, nunca o conteúdo nem o IP.
 */

export const maxDuration = 15;

const MENSAGEM_FALHA =
  "Não conseguimos analisar agora, tente de novo em instantes.";
const MENSAGEM_OCUPADO =
  "Muitas pessoas estão usando o ClariMail agora. Espere um minuto e tente de novo.";

function respostaLimite(motivo: MotivoLimite) {
  const corpo: RespostaLimite = { motivo, mensagem: MENSAGEM_LIMITE_DIARIO };
  return Response.json(corpo, {
    status: 429,
    headers: { "Cache-Control": "no-store" },
  });
}

function respostaFalha(status: number) {
  return Response.json({ erro: MENSAGEM_FALHA }, { status });
}

export async function POST(request: Request) {
  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    corpo = null;
  }

  // Entrada inválida não gasta análise do limite.
  const entrada = validarEntrada(corpo);
  if (!entrada.ok) {
    return Response.json({ erro: entrada.erro }, { status: 400 });
  }

  let modo;
  try {
    modo = escolherModo();
  } catch {
    console.error("[analisar] falha na análise: configuracao");
    return respostaFalha(502);
  }

  // Confere e reserva os limites ANTES de chamar a IA (de forma atômica).
  let reserva;
  try {
    reserva = await obterLimitador().reservar(ipDaRequisicao(request));
  } catch (erro) {
    console.error(
      erro instanceof ErroConfiguracaoLimite
        ? `[limite] configuração ausente: ${erro.falta}`
        : "[limite] falha no armazenamento do limite",
    );
    return respostaFalha(502);
  }
  if (!reserva.ok) {
    console.info(`[limite] análise recusada: ${reserva.motivo}`);
    return respostaLimite(reserva.motivo);
  }

  // Links analisados em código, sem abrir nenhum deles, ANTES da IA.
  const links = analisarLinks(entrada.texto);

  try {
    const daIa = await analisarEmail(entrada.texto, modo, resumoParaIa(links));
    // Junta os indícios dos links; se algo sair do formato, fica só o da IA.
    const juntado = resultadoSchema.safeParse({
      ...daIa,
      indicios: juntarIndicios(daIa.indicios, links.indicios),
    });
    const resultado = juntado.success ? juntado.data : daIa;
    return Response.json(resultado, {
      headers: {
        "Cache-Control": "no-store",
        "X-ClariMail-Modo": modo,
      },
    });
  } catch (erro) {
    const motivo = erro instanceof ErroAnalise ? erro.motivo : "desconhecido";
    // Só o motivo e o código HTTP (ex.: 503); nunca o texto do e-mail.
    const status =
      erro instanceof ErroAnalise && erro.statusHttp
        ? ` (HTTP ${erro.statusHttp})`
        : "";
    console.error(`[analisar] falha na análise: ${motivo}${status}`);

    const escopo = erro instanceof ErroAnalise ? erro.escopoLimite : undefined;

    // Cota do DIA do Gemini acabou: o site fica esgotado até a meia-noite,
    // para não continuar chamando o Gemini à toa.
    if (motivo === "limite" && escopo !== "minuto") {
      await reserva.esgotarSite().catch(() => {});
      return respostaLimite("limite_site");
    }

    // Devolve a análise quando o e-mail não chegou a ser analisado:
    // configuração (a IA nem foi chamada), limite POR MINUTO do Gemini e
    // Gemini sobrecarregado (503). Timeout e outros erros contam como gastos.
    const naoAnalisado =
      motivo === "configuracao" ||
      motivo === "limite" ||
      (erro instanceof ErroAnalise && erro.statusHttp === 503);
    if (naoAnalisado) await reserva.devolver().catch(() => {});

    if (motivo === "limite") {
      return Response.json({ erro: MENSAGEM_OCUPADO }, { status: 503 });
    }
    return respostaFalha(motivo === "timeout" ? 504 : 502);
  }
}

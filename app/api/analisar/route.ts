import { analisarEmail, ErroAnalise, escolherModo } from "@/lib/analisador";
import { validarEntrada } from "@/lib/validacao";

/*
 * POST /api/analisar  { texto: string }  ->  Resultado
 *
 * PRIVACIDADE: o texto do e-mail nunca é salvo nem registrado em log.
 * Os logs abaixo registram só o tipo de falha, nunca o conteúdo.
 */

export const maxDuration = 15;

const MENSAGEM_FALHA =
  "Não conseguimos analisar agora, tente de novo em instantes.";

export async function POST(request: Request) {
  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    corpo = null;
  }

  const entrada = validarEntrada(corpo);
  if (!entrada.ok) {
    return Response.json({ erro: entrada.erro }, { status: 400 });
  }

  try {
    const modo = escolherModo();
    const resultado = await analisarEmail(entrada.texto, modo);
    return Response.json(resultado, {
      headers: {
        "Cache-Control": "no-store",
        "X-ClariMail-Modo": modo,
      },
    });
  } catch (erro) {
    const motivo = erro instanceof ErroAnalise ? erro.motivo : "desconhecido";
    console.error(`[analisar] falha na análise: ${motivo}`);
    return Response.json(
      { erro: MENSAGEM_FALHA },
      { status: motivo === "timeout" ? 504 : 502 },
    );
  }
}

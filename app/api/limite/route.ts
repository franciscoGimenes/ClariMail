import {
  ErroConfiguracaoLimite,
  ipDaRequisicao,
  obterLimitador,
} from "@/lib/limite";
import type { RespostaRestantes } from "@/lib/limiteTextos";

/*
 * GET /api/limite  ->  { restantes: number }
 *
 * Quantas análises ainda restam hoje para quem pergunta: o menor entre o que
 * resta do limite do site e o que resta do limite do IP.
 */
export async function GET(request: Request) {
  try {
    const restantes = await obterLimitador().restantes(ipDaRequisicao(request));
    const corpo: RespostaRestantes = { restantes };
    return Response.json(corpo, { headers: { "Cache-Control": "no-store" } });
  } catch (erro) {
    console.error(
      erro instanceof ErroConfiguracaoLimite
        ? `[limite] configuração ausente: ${erro.falta}`
        : "[limite] falha no armazenamento do limite",
    );
    return Response.json(
      { erro: "Não conseguimos consultar o limite agora." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { montarMensagemUsuario, PROMPT_SISTEMA } from "@/lib/prompt";
import {
  normalizarResultado,
  respostaModeloSchema,
  type Resultado,
} from "@/lib/resultado";
import { analisarSimulado } from "@/lib/simulador";

/*
 * PRIVACIDADE: o texto do e-mail só existe em memória durante a análise.
 * Nunca salve, nunca registre em log e nunca inclua o texto em erros.
 */

export const MODELO_PADRAO = "claude-haiku-5-5";
export const TIMEOUT_MS = 10_000;

/** Erro com mensagem segura para mostrar à pessoa (sem dados do e-mail). */
export class ErroAnalise extends Error {
  constructor(
    public readonly motivo:
      | "configuracao"
      | "timeout"
      | "recusa"
      | "resposta_invalida"
      | "api",
  ) {
    super(`Falha na análise: ${motivo}`);
    this.name = "ErroAnalise";
  }
}

export type ModoAnalise = "anthropic" | "simulacao";

/**
 * Decide o modo: com chave, usa a Anthropic. Sem chave, só em
 * desenvolvimento cai para a simulação; em produção é erro de configuração.
 */
export function escolherModo(
  env: Record<string, string | undefined> = process.env,
): ModoAnalise {
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  if (env.NODE_ENV !== "production") return "simulacao";
  throw new ErroAnalise("configuracao");
}

let cliente: Anthropic | null = null;
function obterCliente(): Anthropic {
  // Sem novas tentativas: o limite total da análise é de 10 segundos.
  // logLevel fixo em "warn": no nível "debug" (ativável por ANTHROPIC_LOG)
  // o SDK registraria o corpo da requisição, que contém o e-mail.
  cliente ??= new Anthropic({
    timeout: TIMEOUT_MS,
    maxRetries: 0,
    logLevel: "warn",
  });
  return cliente;
}

async function analisarComAnthropic(texto: string): Promise<Resultado> {
  const resposta = await obterCliente().messages.parse(
    {
      model: process.env.ANTHROPIC_MODEL || MODELO_PADRAO,
      max_tokens: 1024,
      system: PROMPT_SISTEMA,
      messages: [{ role: "user", content: montarMensagemUsuario(texto) }],
      output_config: {
        effort: "low",
        format: zodOutputFormat(respostaModeloSchema),
      },
    },
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );

  if (resposta.stop_reason === "refusal") throw new ErroAnalise("recusa");
  if (!resposta.parsed_output) throw new ErroAnalise("resposta_invalida");
  return normalizarResultado(resposta.parsed_output);
}

export async function analisarEmail(
  texto: string,
  modo: ModoAnalise = escolherModo(),
): Promise<Resultado> {
  if (modo === "simulacao") return analisarSimulado(texto);

  try {
    return await analisarComAnthropic(texto);
  } catch (erro) {
    if (erro instanceof ErroAnalise) throw erro;
    if (
      erro instanceof Anthropic.APIConnectionTimeoutError ||
      erro instanceof Anthropic.APIUserAbortError ||
      (erro instanceof Error && erro.name === "TimeoutError")
    ) {
      throw new ErroAnalise("timeout");
    }
    if (erro instanceof Anthropic.APIError) throw new ErroAnalise("api");
    // Erro de validação do zod ou outro inesperado
    throw new ErroAnalise("resposta_invalida");
  }
}

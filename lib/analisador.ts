import {
  ApiError,
  FinishReason,
  GoogleGenAI,
  Type,
  type Schema,
} from "@google/genai";
import {
  anexarSinaisLinks,
  montarMensagemUsuario,
  PROMPT_SISTEMA,
} from "@/lib/prompt";
import {
  normalizarResultado,
  respostaModeloSchema,
  VEREDITOS,
  type Resultado,
} from "@/lib/resultado";
import { analisarSimulado } from "@/lib/simulador";

/*
 * PRIVACIDADE: o texto do e-mail só existe em memória durante a análise.
 * Nunca salve, nunca registre em log e nunca inclua o texto em erros.
 *
 * Sobre logs do SDK @google/genai: a chamada models.generateContent não
 * registra requisições. O único log de requisição do SDK (variável
 * GOOGLE_GENAI_DEBUG) existe só nos clientes "interactions"/"agents", que o
 * ClariMail não usa.
 */

/**
 * Modelo usado quando GEMINI_MODEL não estiver definida.
 * Preencha com o nome de um modelo Flash do Google AI Studio.
 * Vazio = obrigatório definir GEMINI_MODEL no ambiente.
 */
export const MODELO_PADRAO = "";

export const TIMEOUT_MS = 10_000;

/**
 * A resposta tem três campos curtos (cerca de 150 tokens). A folga cobre o
 * raciocínio interno que alguns modelos Flash fazem antes de responder e
 * que também conta neste limite.
 */
export const MAX_TOKENS_SAIDA = 1024;

export type EscopoLimite = "dia" | "minuto";

/**
 * O Gemini responde 429 tanto quando acaba a cota do dia quanto quando passa
 * do limite por minuto. A mensagem do erro diz qual foi (ex.: "per minute",
 * "PerDay"). Sem indicação clara, tratamos como cota do dia, o caso mais
 * seguro para não continuar chamando o Gemini.
 */
export function escopoDoLimite(mensagem: string): EscopoLimite {
  if (/per\s*day/i.test(mensagem)) return "dia";
  if (/per\s*minute/i.test(mensagem)) return "minuto";
  return "dia";
}

/** Erro com mensagem segura para mostrar à pessoa (sem dados do e-mail). */
export class ErroAnalise extends Error {
  constructor(
    public readonly motivo:
      | "configuracao"
      | "timeout"
      | "limite"
      | "recusa"
      | "resposta_invalida"
      | "api",
    /** Código HTTP devolvido pelo Gemini, quando houver (ex.: 503). */
    public readonly statusHttp?: number,
    /** Só para "limite": se a cota do Gemini que acabou é a do dia ou a do minuto. */
    public readonly escopoLimite?: EscopoLimite,
  ) {
    super(`Falha na análise: ${motivo}`);
    this.name = "ErroAnalise";
  }
}

export type ModoAnalise = "gemini" | "simulacao";

/**
 * Decide o modo: com chave, usa o Gemini. Sem chave, só em
 * desenvolvimento cai para a simulação; em produção é erro de configuração.
 */
export function escolherModo(
  env: Record<string, string | undefined> = process.env,
): ModoAnalise {
  if (env.GEMINI_API_KEY) return "gemini";
  if (env.NODE_ENV !== "production") return "simulacao";
  throw new ErroAnalise("configuracao");
}

/** GEMINI_MODEL do ambiente ou MODELO_PADRAO; sem nenhum dos dois, erro. */
export function escolherModelo(
  env: Record<string, string | undefined> = process.env,
): string {
  const modelo = env.GEMINI_MODEL?.trim() || MODELO_PADRAO;
  if (!modelo) throw new ErroAnalise("configuracao");
  return modelo;
}

/** Equivalente ao respostaModeloSchema (zod), no formato que o Gemini entende. */
export const ESQUEMA_RESPOSTA: Schema = {
  type: Type.OBJECT,
  properties: {
    nota: {
      type: Type.INTEGER,
      minimum: 0,
      maximum: 100,
      description: "Nota de risco de 0 a 100.",
    },
    veredito: {
      type: Type.STRING,
      enum: [...VEREDITOS],
      description: "0–39 seguro, 40–69 suspeito, 70–100 phishing.",
    },
    resumo: {
      type: Type.STRING,
      description: "1 a 2 frases simples, em português, falando com 'você'.",
    },
  },
  required: ["nota", "veredito", "resumo"],
  propertyOrdering: ["nota", "veredito", "resumo"],
};

let cliente: GoogleGenAI | null = null;
function obterCliente(apiKey: string): GoogleGenAI {
  cliente ??= new GoogleGenAI({
    apiKey,
    vertexai: false, // ignora GOOGLE_GENAI_USE_VERTEXAI do ambiente
    httpOptions: {
      timeout: TIMEOUT_MS,
      retryOptions: { attempts: 1 }, // sem novas tentativas
    },
  });
  return cliente;
}

/** Só para os testes: descarta o cliente guardado. */
export function _reiniciarCliente(): void {
  cliente = null;
}

async function analisarComGemini(
  texto: string,
  sinal: AbortSignal,
  sinaisLinks?: string,
): Promise<Resultado> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ErroAnalise("configuracao");
  const modelo = escolherModelo();

  const resposta = await obterCliente(apiKey).models.generateContent({
    model: modelo,
    contents: anexarSinaisLinks(montarMensagemUsuario(texto), sinaisLinks),
    config: {
      systemInstruction: PROMPT_SISTEMA,
      responseMimeType: "application/json",
      responseSchema: ESQUEMA_RESPOSTA,
      temperature: 0.2,
      maxOutputTokens: MAX_TOKENS_SAIDA,
      abortSignal: sinal,
    },
  });

  if (resposta.promptFeedback?.blockReason) throw new ErroAnalise("recusa");
  const fim = resposta.candidates?.[0]?.finishReason;
  if (
    fim === FinishReason.SAFETY ||
    fim === FinishReason.PROHIBITED_CONTENT ||
    fim === FinishReason.BLOCKLIST
  ) {
    throw new ErroAnalise("recusa");
  }

  const json = resposta.text;
  if (!json) throw new ErroAnalise("resposta_invalida");

  let dados: unknown;
  try {
    dados = JSON.parse(json);
  } catch {
    throw new ErroAnalise("resposta_invalida");
  }
  // O Gemini respeita o esquema, mas validamos de novo com zod.
  const validado = respostaModeloSchema.safeParse(dados);
  if (!validado.success) throw new ErroAnalise("resposta_invalida");
  return normalizarResultado(validado.data);
}

/** Reconhece o cancelamento pelo nome, sem depender da classe do erro. */
function ehTimeout(erro: unknown): boolean {
  const nome =
    typeof erro === "object" && erro !== null && "name" in erro
      ? String(erro.name)
      : "";
  return nome === "TimeoutError" || nome === "AbortError";
}

/**
 * @param sinaisLinks resumo da verificação dos links (lib/links.ts), enviado
 *   ao Gemini fora do bloco do e-mail para a nota e o resumo levarem em conta.
 */
export async function analisarEmail(
  texto: string,
  modo: ModoAnalise = escolherModo(),
  sinaisLinks?: string,
): Promise<Resultado> {
  if (modo === "simulacao") return analisarSimulado(texto);

  const sinal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    return await analisarComGemini(texto, sinal, sinaisLinks);
  } catch (erro) {
    if (erro instanceof ErroAnalise) throw erro;
    // Se os 10 s estouraram, é timeout, qualquer que seja o formato do erro
    // (o cancelamento pode chegar no meio da leitura da resposta).
    if (sinal.aborted || ehTimeout(erro)) throw new ErroAnalise("timeout");
    if (erro instanceof ApiError) {
      if (erro.status === 429 || /RESOURCE_EXHAUSTED/.test(erro.message)) {
        throw new ErroAnalise("limite", erro.status, escopoDoLimite(erro.message));
      }
      throw new ErroAnalise("api", erro.status);
    }
    if (erro instanceof Error && /RESOURCE_EXHAUSTED/.test(erro.message)) {
      throw new ErroAnalise("limite", undefined, escopoDoLimite(erro.message));
    }
    throw new ErroAnalise("api");
  }
}

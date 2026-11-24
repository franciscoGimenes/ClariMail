import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import type { MotivoLimite } from "@/lib/limiteTextos";

/*
 * Limite diário de análises, para não estourar a cota gratuita do Gemini.
 *
 * - Limite do site por dia (LIMITE_DIARIO_SITE, padrão 150).
 * - Limite por pessoa por dia, pelo IP (LIMITE_DIARIO_IP, padrão 10).
 * - O dia vira à meia-noite de America/Sao_Paulo.
 * - Chaves por dia, com expiração de 48 h:
 *     limite:site:2026-11-24
 *     limite:ip:<sha256(sal + ip)>:2026-11-24
 * - PRIVACIDADE: o IP nunca é guardado puro, só o hash com sal (LIMITE_SAL).
 */

export const LIMITE_SITE_PADRAO = 150;
export const LIMITE_IP_PADRAO = 10;
export const EXPIRACAO_SEGUNDOS = 48 * 60 * 60;
export const FUSO = "America/Sao_Paulo";

/** Sal só para desenvolvimento e testes; em produção LIMITE_SAL é obrigatório. */
const SAL_DESENVOLVIMENTO = "clarimail-sal-de-desenvolvimento";

type Env = Record<string, string | undefined>;

/** Erro de configuração do limite (ex.: produção sem Redis ou sem sal). */
export class ErroConfiguracaoLimite extends Error {
  constructor(public readonly falta: string) {
    super(`Limite diário sem configuração: ${falta}`);
    this.name = "ErroConfiguracaoLimite";
  }
}

// ---------------------------------------------------------------------------
// Armazenamento
// ---------------------------------------------------------------------------

export type ResultadoReserva =
  | { ok: true; site: number; ip: number }
  | { ok: false; motivo: MotivoLimite; site: number; ip: number };

export interface ArmazenamentoLimite {
  /**
   * Confere os dois limites e, se houver vaga, soma 1 nos dois contadores.
   * Tudo de uma vez (atômico): duas análises ao mesmo tempo nunca passam do
   * limite. Se não houver vaga, nada é somado.
   */
  reservar(
    chaveSite: string,
    chaveIp: string,
    limiteSite: number,
    limiteIp: number,
    expiracaoSegundos: number,
  ): Promise<ResultadoReserva>;
  /** Devolve uma reserva (quando a IA acabou não sendo chamada). */
  devolver(chaveSite: string, chaveIp: string): Promise<void>;
  /** Lê os contadores (0 quando a chave não existe). */
  ler(chaveSite: string, chaveIp: string): Promise<{ site: number; ip: number }>;
}

/** Em memória: para desenvolvimento e testes (zera quando o servidor reinicia). */
export class ArmazenamentoMemoria implements ArmazenamentoLimite {
  private readonly valores = new Map<string, { valor: number; expiraEm: number }>();

  constructor(private readonly agora: () => number = Date.now) {}

  private obter(chave: string): number {
    const item = this.valores.get(chave);
    if (!item) return 0;
    if (item.expiraEm <= this.agora()) {
      this.valores.delete(chave);
      return 0;
    }
    return item.valor;
  }

  private definir(chave: string, valor: number, expiracaoSegundos: number) {
    this.valores.set(chave, {
      valor,
      expiraEm: this.agora() + expiracaoSegundos * 1000,
    });
  }

  /** Só para os testes: quanto tempo falta para a chave expirar. */
  segundosParaExpirar(chave: string): number | null {
    const item = this.valores.get(chave);
    return item ? Math.round((item.expiraEm - this.agora()) / 1000) : null;
  }

  // Sem `await` entre a leitura e a escrita: no JavaScript isso é atômico.
  async reservar(
    chaveSite: string,
    chaveIp: string,
    limiteSite: number,
    limiteIp: number,
    expiracaoSegundos: number,
  ): Promise<ResultadoReserva> {
    const site = this.obter(chaveSite);
    const ip = this.obter(chaveIp);
    if (site >= limiteSite) return { ok: false, motivo: "limite_site", site, ip };
    if (ip >= limiteIp) return { ok: false, motivo: "limite_ip", site, ip };
    this.definir(chaveSite, site + 1, expiracaoSegundos);
    this.definir(chaveIp, ip + 1, expiracaoSegundos);
    return { ok: true, site: site + 1, ip: ip + 1 };
  }

  async devolver(chaveSite: string, chaveIp: string): Promise<void> {
    for (const chave of [chaveSite, chaveIp]) {
      const item = this.valores.get(chave);
      if (item && item.valor > 0) item.valor -= 1;
    }
  }

  async ler(chaveSite: string, chaveIp: string) {
    return { site: this.obter(chaveSite), ip: this.obter(chaveIp) };
  }
}

/**
 * Script Lua: o Redis executa o script inteiro sem intercalar outros
 * comandos, então conferir e somar acontece de forma atômica.
 * Retorno: [situação, site, ip], situação 1 = ok, 0 = limite do site,
 * -1 = limite do IP.
 */
const SCRIPT_RESERVAR = `
local site = tonumber(redis.call('GET', KEYS[1]) or '0')
local ip = tonumber(redis.call('GET', KEYS[2]) or '0')
if site >= tonumber(ARGV[1]) then return {0, site, ip} end
if ip >= tonumber(ARGV[2]) then return {-1, site, ip} end
site = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[3])
ip = redis.call('INCR', KEYS[2])
redis.call('EXPIRE', KEYS[2], ARGV[3])
return {1, site, ip}
`;

const SCRIPT_DEVOLVER = `
for i = 1, #KEYS do
  if tonumber(redis.call('GET', KEYS[i]) or '0') > 0 then
    redis.call('DECR', KEYS[i])
  end
end
return 1
`;

/** Upstash Redis (na Vercel, pela integração Upstash / KV). */
export class ArmazenamentoRedis implements ArmazenamentoLimite {
  constructor(private readonly redis: Pick<Redis, "eval" | "mget">) {}

  async reservar(
    chaveSite: string,
    chaveIp: string,
    limiteSite: number,
    limiteIp: number,
    expiracaoSegundos: number,
  ): Promise<ResultadoReserva> {
    const [situacao, site, ip] = await this.redis.eval<string[], number[]>(
      SCRIPT_RESERVAR,
      [chaveSite, chaveIp],
      [String(limiteSite), String(limiteIp), String(expiracaoSegundos)],
    );
    if (situacao === 1) return { ok: true, site, ip };
    return {
      ok: false,
      motivo: situacao === 0 ? "limite_site" : "limite_ip",
      site,
      ip,
    };
  }

  async devolver(chaveSite: string, chaveIp: string): Promise<void> {
    await this.redis.eval(SCRIPT_DEVOLVER, [chaveSite, chaveIp], []);
  }

  async ler(chaveSite: string, chaveIp: string) {
    const [site, ip] = await this.redis.mget<(number | string | null)[]>(
      chaveSite,
      chaveIp,
    );
    return { site: Number(site ?? 0), ip: Number(ip ?? 0) };
  }
}

/** Lê a URL e o token do Upstash (nomes do Upstash ou os que a Vercel cria). */
export function credenciaisRedis(env: Env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

// ---------------------------------------------------------------------------
// Regras
// ---------------------------------------------------------------------------

function inteiroPositivo(valor: string | undefined, padrao: number): number {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : padrao;
}

export function lerLimites(env: Env = process.env) {
  return {
    site: inteiroPositivo(env.LIMITE_DIARIO_SITE, LIMITE_SITE_PADRAO),
    ip: inteiroPositivo(env.LIMITE_DIARIO_IP, LIMITE_IP_PADRAO),
  };
}

/** Data de hoje em America/Sao_Paulo, no formato 2026-11-24. */
export function diaEmSaoPaulo(agora: Date = new Date()): string {
  // en-CA formata como AAAA-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

export function hashIp(ip: string, sal: string): string {
  return createHash("sha256").update(`${sal}:${ip}`).digest("hex");
}

export function chavesDoDia(ipHash: string, dia: string) {
  return {
    site: `limite:site:${dia}`,
    ip: `limite:ip:${ipHash}:${dia}`,
  };
}

/** IP de quem fez a requisição (na Vercel, o primeiro de x-forwarded-for). */
export function ipDaRequisicao(request: Request): string {
  const encaminhado = request.headers.get("x-forwarded-for");
  const primeiro = encaminhado?.split(",")[0]?.trim();
  return primeiro || request.headers.get("x-real-ip")?.trim() || "desconhecido";
}

export class Limitador {
  constructor(
    private readonly armazenamento: ArmazenamentoLimite,
    private readonly sal: string,
    private readonly limites: { site: number; ip: number },
    private readonly agora: () => Date = () => new Date(),
  ) {}

  private chaves(ip: string) {
    return chavesDoDia(hashIp(ip, this.sal), diaEmSaoPaulo(this.agora()));
  }

  /** Reserva uma análise para este IP. Devolve a reserva para um possível estorno. */
  async reservar(ip: string) {
    const chaves = this.chaves(ip);
    const resultado = await this.armazenamento.reservar(
      chaves.site,
      chaves.ip,
      this.limites.site,
      this.limites.ip,
      EXPIRACAO_SEGUNDOS,
    );
    return {
      ...resultado,
      devolver: () => this.armazenamento.devolver(chaves.site, chaves.ip),
    };
  }

  /** Quantas análises ainda restam hoje para este IP. */
  async restantes(ip: string): Promise<number> {
    const chaves = this.chaves(ip);
    const { site, ip: doIp } = await this.armazenamento.ler(chaves.site, chaves.ip);
    return Math.max(
      0,
      Math.min(this.limites.site - site, this.limites.ip - doIp),
    );
  }
}

// ---------------------------------------------------------------------------
// Instância usada pelas rotas
// ---------------------------------------------------------------------------

let limitador: Limitador | null = null;

/**
 * Monta o limitador a partir do ambiente:
 * - com Upstash configurado, usa o Redis;
 * - sem Upstash, só fora de produção, usa a memória;
 * - em produção, exige Upstash e LIMITE_SAL.
 */
export function obterLimitador(env: Env = process.env): Limitador {
  if (limitador) return limitador;
  const producao = env.NODE_ENV === "production";

  const sal = env.LIMITE_SAL || (producao ? "" : SAL_DESENVOLVIMENTO);
  if (!sal) throw new ErroConfiguracaoLimite("LIMITE_SAL");

  const credenciais = credenciaisRedis(env);
  let armazenamento: ArmazenamentoLimite;
  if (credenciais) {
    armazenamento = new ArmazenamentoRedis(
      new Redis({
        ...credenciais,
        enableTelemetry: false,
        retry: { retries: 1 }, // não estoura o tempo da análise
      }),
    );
  } else if (!producao) {
    armazenamento = new ArmazenamentoMemoria();
  } else {
    throw new ErroConfiguracaoLimite("UPSTASH_REDIS_REST_URL/TOKEN ou KV_REST_API_URL/TOKEN");
  }

  limitador = new Limitador(armazenamento, sal, lerLimites(env));
  return limitador;
}

/** Só para os testes: troca ou descarta o limitador em uso. */
export function _definirLimitador(novo: Limitador | null): void {
  limitador = novo;
}

// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import {
  _definirLimitador,
  ArmazenamentoMemoria,
  ArmazenamentoRedis,
  chavesDoDia,
  credenciaisRedis,
  diaEmSaoPaulo,
  ErroConfiguracaoLimite,
  EXPIRACAO_SEGUNDOS,
  hashIp,
  ipDaRequisicao,
  LIMITE_IP_PADRAO,
  LIMITE_SITE_PADRAO,
  Limitador,
  lerLimites,
  obterLimitador,
} from "@/lib/limite";

/** Relógio controlável compartilhado pelo limitador e pela memória. */
function relogio(inicioIso: string) {
  let agora = new Date(inicioIso).getTime();
  return {
    agora: () => agora,
    data: () => new Date(agora),
    ir: (iso: string) => {
      agora = new Date(iso).getTime();
    },
  };
}

function montar(limites: { site: number; ip: number }, inicioIso = "2026-11-24T15:00:00Z") {
  const r = relogio(inicioIso);
  const memoria = new ArmazenamentoMemoria(r.agora);
  const limitador = new Limitador(memoria, "sal-de-teste", limites, r.data);
  return { r, memoria, limitador };
}

describe("dia em America/Sao_Paulo", () => {
  test("a virada acontece à meia-noite de São Paulo (03:00 UTC)", () => {
    expect(diaEmSaoPaulo(new Date("2026-11-25T02:59:59Z"))).toBe("2026-11-24");
    expect(diaEmSaoPaulo(new Date("2026-11-25T03:00:00Z"))).toBe("2026-11-25");
  });

  test("à tarde em São Paulo ainda é o mesmo dia, mesmo já sendo outro dia em UTC", () => {
    expect(diaEmSaoPaulo(new Date("2026-11-25T01:30:00Z"))).toBe("2026-11-24");
  });
});

describe("chaves e privacidade do IP", () => {
  test("as chaves seguem o formato por dia", () => {
    expect(chavesDoDia("abc", "2026-11-24")).toEqual({
      site: "limite:site:2026-11-24",
      ip: "limite:ip:abc:2026-11-24",
    });
  });

  test("o IP vira hash SHA-256 com sal e nunca aparece puro", () => {
    const hash = hashIp("200.150.10.7", "sal-a");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("200.150");
    expect(hashIp("200.150.10.7", "sal-a")).toBe(hash);
    expect(hashIp("200.150.10.7", "sal-b")).not.toBe(hash);
  });

  test("o IP vem do primeiro x-forwarded-for", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "200.1.2.3, 10.0.0.1" },
    });
    expect(ipDaRequisicao(req)).toBe("200.1.2.3");
    expect(ipDaRequisicao(new Request("http://x"))).toBe("desconhecido");
  });
});

describe("contagem", () => {
  test("conta cada análise e informa quanto resta", async () => {
    const { limitador } = montar({ site: 150, ip: 10 });
    expect(await limitador.restantes("1.1.1.1")).toBe(10);
    await limitador.reservar("1.1.1.1");
    await limitador.reservar("1.1.1.1");
    expect(await limitador.restantes("1.1.1.1")).toBe(8);
  });

  test("grava as chaves com expiração de 48 h", async () => {
    const { memoria, limitador } = montar({ site: 150, ip: 10 });
    await limitador.reservar("1.1.1.1");
    const chaves = chavesDoDia(hashIp("1.1.1.1", "sal-de-teste"), "2026-11-24");
    expect(memoria.segundosParaExpirar(chaves.site)).toBe(EXPIRACAO_SEGUNDOS);
    expect(memoria.segundosParaExpirar(chaves.ip)).toBe(48 * 60 * 60);
  });

  test("devolver uma reserva libera a vaga", async () => {
    const { limitador } = montar({ site: 150, ip: 10 });
    const reserva = await limitador.reservar("1.1.1.1");
    await reserva.devolver();
    expect(await limitador.restantes("1.1.1.1")).toBe(10);
  });
});

describe("limite por IP", () => {
  test("a pessoa para no limite dela e as outras continuam", async () => {
    const { limitador } = montar({ site: 150, ip: 2 });
    expect((await limitador.reservar("1.1.1.1")).ok).toBe(true);
    expect((await limitador.reservar("1.1.1.1")).ok).toBe(true);
    const negada = await limitador.reservar("1.1.1.1");
    expect(negada).toMatchObject({ ok: false, motivo: "limite_ip" });
    expect(await limitador.restantes("1.1.1.1")).toBe(0);

    expect((await limitador.reservar("2.2.2.2")).ok).toBe(true);
    expect(await limitador.restantes("2.2.2.2")).toBe(1);
  });

  test("a recusa não soma nada nos contadores", async () => {
    const { limitador } = montar({ site: 150, ip: 1 });
    await limitador.reservar("1.1.1.1");
    for (let i = 0; i < 5; i++) await limitador.reservar("1.1.1.1");
    // O site só contou a única análise aceita.
    expect(await limitador.restantes("9.9.9.9")).toBe(1);
  });
});

describe("limite do site", () => {
  test("quando o site esgota, ninguém mais analisa no dia", async () => {
    const { limitador } = montar({ site: 3, ip: 10 });
    for (const ip of ["1.1.1.1", "2.2.2.2", "3.3.3.3"]) {
      expect((await limitador.reservar(ip)).ok).toBe(true);
    }
    expect(await limitador.reservar("4.4.4.4")).toMatchObject({
      ok: false,
      motivo: "limite_site",
    });
    expect(await limitador.restantes("4.4.4.4")).toBe(0);
  });

  test("restantes é o menor entre o que resta do site e do IP", async () => {
    const { limitador } = montar({ site: 4, ip: 10 });
    await limitador.reservar("1.1.1.1");
    await limitador.reservar("1.1.1.1");
    await limitador.reservar("2.2.2.2");
    expect(await limitador.restantes("3.3.3.3")).toBe(1); // site: 4 - 3
    expect(await limitador.restantes("1.1.1.1")).toBe(1);
  });

  test("reservas ao mesmo tempo nunca passam do limite", async () => {
    const { limitador } = montar({ site: 10, ip: 100 });
    const resultados = await Promise.all(
      Array.from({ length: 25 }, (_, i) => limitador.reservar(`10.0.0.${i}`)),
    );
    expect(resultados.filter((r) => r.ok)).toHaveLength(10);
  });
});

describe("virada do dia", () => {
  test("o limite volta à meia-noite de São Paulo, não à meia-noite UTC", async () => {
    // 23:30 de 24/11 em São Paulo
    const { r, limitador } = montar({ site: 150, ip: 1 }, "2026-11-25T02:30:00Z");
    expect((await limitador.reservar("1.1.1.1")).ok).toBe(true);
    expect((await limitador.reservar("1.1.1.1")).ok).toBe(false);

    r.ir("2026-11-25T02:59:59Z"); // 23:59:59 em São Paulo: ainda é dia 24
    expect(await limitador.restantes("1.1.1.1")).toBe(0);

    r.ir("2026-11-25T03:00:00Z"); // 00:00 em São Paulo: dia 25
    expect(await limitador.restantes("1.1.1.1")).toBe(1);
    expect((await limitador.reservar("1.1.1.1")).ok).toBe(true);
  });
});

describe("configuração", () => {
  test("limites padrão e valores inválidos", () => {
    expect(lerLimites({})).toEqual({ site: LIMITE_SITE_PADRAO, ip: LIMITE_IP_PADRAO });
    expect(LIMITE_SITE_PADRAO).toBe(150);
    expect(LIMITE_IP_PADRAO).toBe(10);
    expect(lerLimites({ LIMITE_DIARIO_SITE: "40", LIMITE_DIARIO_IP: "3" })).toEqual({
      site: 40,
      ip: 3,
    });
    expect(lerLimites({ LIMITE_DIARIO_SITE: "abc", LIMITE_DIARIO_IP: "-1" })).toEqual({
      site: 150,
      ip: 10,
    });
  });

  test("aceita os nomes do Upstash e os nomes que a Vercel cria", () => {
    expect(
      credenciaisRedis({ UPSTASH_REDIS_REST_URL: "https://u", UPSTASH_REDIS_REST_TOKEN: "t" }),
    ).toEqual({ url: "https://u", token: "t" });
    expect(
      credenciaisRedis({ KV_REST_API_URL: "https://k", KV_REST_API_TOKEN: "t2" }),
    ).toEqual({ url: "https://k", token: "t2" });
    expect(credenciaisRedis({})).toBeNull();
  });

  test("em produção exige LIMITE_SAL e o Redis", () => {
    _definirLimitador(null);
    expect(() => obterLimitador({ NODE_ENV: "production" })).toThrow(ErroConfiguracaoLimite);
    _definirLimitador(null);
    expect(() =>
      obterLimitador({ NODE_ENV: "production", LIMITE_SAL: "s" }),
    ).toThrow(/UPSTASH/);
    _definirLimitador(null);
  });

  test("em desenvolvimento funciona em memória sem configurar nada", async () => {
    _definirLimitador(null);
    const limitador = obterLimitador({ NODE_ENV: "development" });
    expect(await limitador.restantes("1.1.1.1")).toBe(LIMITE_IP_PADRAO);
    _definirLimitador(null);
  });
});

describe("armazenamento Redis", () => {
  test("usa um script atômico com as duas chaves, os limites e as 48 h", async () => {
    const evalMock = vi.fn().mockResolvedValue([1, 5, 2]);
    const redis = new ArmazenamentoRedis({ eval: evalMock, mget: vi.fn() } as never);
    const r = await redis.reservar("limite:site:d", "limite:ip:h:d", 150, 10, EXPIRACAO_SEGUNDOS);
    expect(r).toEqual({ ok: true, site: 5, ip: 2 });
    const [script, chaves, args] = evalMock.mock.calls[0];
    expect(script).toContain("INCR");
    expect(script).toContain("EXPIRE");
    expect(chaves).toEqual(["limite:site:d", "limite:ip:h:d"]);
    expect(args).toEqual(["150", "10", String(48 * 60 * 60)]);
  });

  test("traduz as recusas do script", async () => {
    const evalMock = vi.fn().mockResolvedValueOnce([0, 150, 3]).mockResolvedValueOnce([-1, 20, 10]);
    const redis = new ArmazenamentoRedis({ eval: evalMock, mget: vi.fn() } as never);
    expect(await redis.reservar("s", "i", 150, 10, 1)).toMatchObject({ ok: false, motivo: "limite_site" });
    expect(await redis.reservar("s", "i", 150, 10, 1)).toMatchObject({ ok: false, motivo: "limite_ip" });
  });

  test("lê contadores ausentes como zero", async () => {
    const redis = new ArmazenamentoRedis({
      eval: vi.fn(),
      mget: vi.fn().mockResolvedValue([null, "4"]),
    } as never);
    expect(await redis.ler("s", "i")).toEqual({ site: 0, ip: 4 });
  });
});

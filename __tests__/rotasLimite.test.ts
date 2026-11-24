// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@google/genai";
import { _reiniciarCliente } from "@/lib/analisador";
import { _definirLimitador, ArmazenamentoMemoria, Limitador } from "@/lib/limite";
import { MENSAGEM_LIMITE_DIARIO } from "@/lib/limiteTextos";
import { POST } from "@/app/api/analisar/route";
import { GET } from "@/app/api/limite/route";

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock("@google/genai", async (importOriginal) => {
  const original = await importOriginal<typeof import("@google/genai")>();
  class GoogleGenAI {
    models = { generateContent };
  }
  return { ...original, GoogleGenAI };
});

const EMAIL = "De: banco@exemplo.test\nSua conta foi bloqueada, confirme a senha agora.";
const RESPOSTA_OK = {
  text: JSON.stringify({ nota: 90, veredito: "phishing", resumo: "Golpe." }),
  candidates: [{ finishReason: "STOP" }],
};

function analisar(ip: string, corpo: unknown = { texto: EMAIL }) {
  return POST(
    new Request("http://localhost/api/analisar", {
      method: "POST",
      headers: { "x-forwarded-for": ip },
      body: JSON.stringify(corpo),
    }),
  );
}

async function restantes(ip: string) {
  const resposta = await GET(
    new Request("http://localhost/api/limite", { headers: { "x-forwarded-for": ip } }),
  );
  return (await resposta.json()).restantes as number;
}

let logs: ReturnType<typeof vi.spyOn>[] = [];

beforeEach(() => {
  generateContent.mockReset();
  generateContent.mockResolvedValue(RESPOSTA_OK);
  _reiniciarCliente();
  _definirLimitador(
    new Limitador(new ArmazenamentoMemoria(), "sal-de-teste", { site: 3, ip: 2 }),
  );
  vi.stubEnv("GEMINI_API_KEY", "chave-de-teste");
  vi.stubEnv("GEMINI_MODEL", "modelo-de-teste");
  logs = [
    vi.spyOn(console, "error").mockImplementation(() => {}),
    vi.spyOn(console, "info").mockImplementation(() => {}),
  ];
});
afterEach(() => {
  vi.unstubAllEnvs();
  logs.forEach((l) => l.mockRestore());
  _definirLimitador(null);
});

describe("POST /api/analisar com limite diário", () => {
  test("limite por IP: responde 429 limite_ip sem chamar a IA", async () => {
    expect((await analisar("1.1.1.1")).status).toBe(200);
    expect((await analisar("1.1.1.1")).status).toBe(200);
    expect(generateContent).toHaveBeenCalledTimes(2);

    const resposta = await analisar("1.1.1.1");
    expect(resposta.status).toBe(429);
    expect(await resposta.json()).toEqual({
      motivo: "limite_ip",
      mensagem: MENSAGEM_LIMITE_DIARIO,
    });
    expect(generateContent).toHaveBeenCalledTimes(2); // não chamou de novo
  });

  test("limite do site: responde 429 limite_site sem chamar a IA", async () => {
    for (const ip of ["1.1.1.1", "2.2.2.2", "3.3.3.3"]) {
      expect((await analisar(ip)).status).toBe(200);
    }
    const resposta = await analisar("4.4.4.4");
    expect(resposta.status).toBe(429);
    expect((await resposta.json()).motivo).toBe("limite_site");
    expect(generateContent).toHaveBeenCalledTimes(3);
  });

  test("entrada inválida não gasta análise", async () => {
    expect((await analisar("1.1.1.1", { texto: "oi" })).status).toBe(400);
    expect((await analisar("1.1.1.1", { texto: "" })).status).toBe(400);
    expect((await analisar("1.1.1.1", null)).status).toBe(400);
    expect(generateContent).not.toHaveBeenCalled();
    expect(await restantes("1.1.1.1")).toBe(2);
  });

  test("falha da IA depois de chamada conta como análise gasta", async () => {
    generateContent.mockRejectedValue(new ApiError({ status: 503, message: "high demand" }));
    expect((await analisar("1.1.1.1")).status).toBe(502);
    expect(await restantes("1.1.1.1")).toBe(1);
  });

  test("erro de configuração antes de chamar a IA devolve a análise", async () => {
    vi.stubEnv("GEMINI_MODEL", "");
    expect((await analisar("1.1.1.1")).status).toBe(502);
    expect(generateContent).not.toHaveBeenCalled();
    expect(await restantes("1.1.1.1")).toBe(2);
  });

  test("o 429 do próprio Gemini vira limite do site", async () => {
    generateContent.mockRejectedValue(new ApiError({ status: 429, message: "quota" }));
    const resposta = await analisar("1.1.1.1");
    expect(resposta.status).toBe(429);
    expect(await resposta.json()).toEqual({
      motivo: "limite_site",
      mensagem: MENSAGEM_LIMITE_DIARIO,
    });
  });

  test("nenhum log contém o IP nem o texto do e-mail", async () => {
    await analisar("200.150.10.7");
    await analisar("200.150.10.7");
    await analisar("200.150.10.7"); // recusada
    const tudo = JSON.stringify(logs.map((l) => l.mock.calls));
    expect(tudo).not.toContain("200.150");
    expect(tudo).not.toContain("senha agora");
  });
});

describe("GET /api/limite", () => {
  test("devolve o menor entre o restante do site e o do IP", async () => {
    expect(await restantes("1.1.1.1")).toBe(2); // IP: 2, site: 3
    await analisar("2.2.2.2");
    await analisar("3.3.3.3");
    expect(await restantes("1.1.1.1")).toBe(1); // site: 3 - 2
    await analisar("1.1.1.1");
    expect(await restantes("1.1.1.1")).toBe(0);
  });

  test("não deixa a resposta ser guardada em cache", async () => {
    const resposta = await GET(new Request("http://localhost/api/limite"));
    expect(resposta.headers.get("Cache-Control")).toBe("no-store");
  });
});

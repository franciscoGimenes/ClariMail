// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { _reiniciarCliente } from "@/lib/analisador";
import { _definirLimitador } from "@/lib/limite";
import { POST } from "@/app/api/analisar/route";

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock("@google/genai", async (importOriginal) => {
  const original = await importOriginal<typeof import("@google/genai")>();
  class GoogleGenAI {
    models = { generateContent };
  }
  return { ...original, GoogleGenAI };
});

const EMAIL = `De: Itaú Segurança <aviso@itau-atendimento.net.br>
Assunto: Sua conta será bloqueada

Regularize em https://itau-atendimento.net.br/login ou pelo atalho https://bit.ly/itau-regulariza`;

function analisar(texto = EMAIL) {
  return POST(
    new Request("http://localhost/api/analisar", {
      method: "POST",
      headers: { "x-forwarded-for": "1.1.1.1" },
      body: JSON.stringify({ texto }),
    }),
  );
}

let fetchEspiao: ReturnType<typeof vi.fn>;

beforeEach(() => {
  generateContent.mockReset();
  generateContent.mockResolvedValue({
    text: JSON.stringify({ nota: 92, veredito: "phishing", resumo: "Golpe." }),
    candidates: [{ finishReason: "STOP" }],
  });
  _reiniciarCliente();
  _definirLimitador(null);
  vi.stubEnv("GEMINI_API_KEY", "chave-de-teste");
  vi.stubEnv("GEMINI_MODEL", "modelo-de-teste");
  fetchEspiao = vi.fn(() => {
    throw new Error("a rota tentou abrir um link!");
  });
  vi.stubGlobal("fetch", fetchEspiao);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  _definirLimitador(null);
});

test("envia ao Gemini os sinais dos links, fora do bloco do e-mail", async () => {
  expect((await analisar()).status).toBe(200);
  const [pedido] = generateContent.mock.calls[0];
  const mensagem: string = pedido.contents;

  const fimDoEmail = mensagem.indexOf("</email>");
  const sinais = mensagem.indexOf("Sinais já verificados nos links");
  expect(fimDoEmail).toBeGreaterThan(0);
  expect(sinais).toBeGreaterThan(fimDoEmail);
  expect(mensagem.slice(sinais)).toContain("itau-atendimento.net.br: imita o site do Itaú");
  expect(mensagem.slice(sinais)).toContain("bit.ly: é um link encurtado");
});

test("devolve os indícios dos links junto com o resultado", async () => {
  const corpo = await (await analisar()).json();
  expect(corpo.veredito).toBe("phishing");
  const links = corpo.indicios.filter((i: { origem?: string }) => i.origem === "links");
  expect(links.map((i: { trecho: string }) => i.trecho)).toEqual([
    "https://itau-atendimento.net.br/login",
    "https://bit.ly/itau-regulariza",
  ]);
  expect(links[0]).toMatchObject({ gravidade: "critico", titulo: "Link que imita o site do Itaú" });
});

test("nenhum link é aberto durante a análise", async () => {
  await analisar();
  expect(fetchEspiao).not.toHaveBeenCalled();
});

test("e-mail sem links: o Gemini recebe o aviso e não há indícios de links", async () => {
  const corpo = await (await analisar("De: Ana <ana@empresa.com.br>\nOi, a reunião está mantida para quinta.")).json();
  expect(generateContent.mock.calls[0][0].contents).toContain("O e-mail não tem links.");
  expect(corpo.indicios).toEqual([]);
});

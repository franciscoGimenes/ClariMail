import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import ResultadoView from "@/components/ResultadoView";
import { vereditoPorNota } from "@/lib/resultado";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
}));

const CHAVE = "clarimail:resultado";

function guardar(nota: number, resumo = "Resumo da análise.") {
  sessionStorage.setItem(
    CHAVE,
    JSON.stringify({ veredito: vereditoPorNota(nota), nota, resumo, indicios: [] }),
  );
}

beforeEach(() => {
  replace.mockReset();
  sessionStorage.clear();
});
afterEach(cleanup);

describe.each([
  [85, "Risco alto", "Este e-mail provavelmente é phishing", 3],
  [55, "Risco médio", "Este e-mail tem sinais suspeitos", 3],
  [12, "Risco baixo", "Este e-mail parece seguro", 2],
] as const)("nota %i", (nota, etiqueta, titulo, qtdOrientacoes) => {
  test("mostra nível com texto e ícone, título, resumo e a nota junto ao veredito", () => {
    guardar(nota, "Texto do resumo da IA.");
    render(<ResultadoView />);

    const card = screen.getByRole("region", { name: titulo });
    const selo = within(card).getByText(etiqueta);
    expect(selo.querySelector("svg")).not.toBeNull();
    expect(within(card).getByRole("heading", { level: 1 }).textContent).toBe(titulo);
    expect(within(card).getByText("Texto do resumo da IA.")).toBeDefined();
    expect(
      within(card).getByRole("img", { name: `Nota de risco ${nota} de 100` }),
    ).toBeDefined();
  });

  test(`mostra ${qtdOrientacoes} orientações em "O que fazer agora"`, () => {
    guardar(nota);
    render(<ResultadoView />);
    const card = screen.getByRole("region", { name: "O que fazer agora" });
    expect(within(card).getAllByRole("listitem")).toHaveLength(qtdOrientacoes);
  });
});

test("mostra o aviso de resultado automatizado", () => {
  guardar(50);
  render(<ResultadoView />);
  expect(
    screen.getByText(/Resultado automatizado\. Em caso de dúvida, confirme sempre/),
  ).toBeDefined();
});

test("não mostra itens fora do escopo da sprint", () => {
  guardar(90);
  const { container } = render(<ResultadoView />);
  const texto = container.textContent ?? "";
  for (const proibido of [
    "Sinais encontrados",
    "Baixar relatório",
    "PDF",
    "Denunciar",
    "Código da análise",
  ]) {
    expect(texto).not.toContain(proibido);
  }
});

test("sem resultado em memória redireciona para a página inicial", () => {
  render(<ResultadoView />);
  expect(replace).toHaveBeenCalledWith("/");
});

test("resultado corrompido também redireciona", () => {
  sessionStorage.setItem(CHAVE, "{não é json");
  render(<ResultadoView />);
  expect(replace).toHaveBeenCalledWith("/");
});

test('"Analisar outro e-mail" aponta para o início e limpa o resultado', () => {
  guardar(75);
  render(<ResultadoView />);
  const link = screen.getByRole("link", { name: "Analisar outro e-mail" });
  expect(link.getAttribute("href")).toBe("/");

  fireEvent.click(link);
  expect(sessionStorage.getItem(CHAVE)).toBeNull();
});

// ---------------------------------------------------------------------------
// Seção "O que encontramos" (indícios)
// ---------------------------------------------------------------------------

const ind = (titulo: string, gravidade: string, explicacao = `Explicação de ${titulo}.`) => ({
  titulo,
  explicacao,
  gravidade,
  trecho: null,
  origem: "ia",
});

function guardarComIndicios(nota: number, indicios: unknown[]) {
  sessionStorage.setItem(
    CHAVE,
    JSON.stringify({ veredito: vereditoPorNota(nota), nota, resumo: "Resumo.", indicios }),
  );
}

describe.each([
  [90, [ind("Pede sua senha", "critico"), ind("Cria pressa", "atencao")]],
  [55, [ind("Saudação genérica", "atencao"), ind("Link para clicar", "atencao")]],
  [10, [ind("Remetente conhecido", "confiavel"), ind("Não pede dados", "confiavel")]],
] as const)("nota %i", (nota, indicios) => {
  test("mostra a seção com título, explicação, ícone e rótulo de texto da gravidade", () => {
    guardarComIndicios(nota, [...indicios]);
    render(<ResultadoView />);
    const secao = screen.getByRole("region", { name: "O que encontramos" });
    const itens = within(secao).getAllByRole("listitem");
    expect(itens).toHaveLength(indicios.length);

    const rotulos: Record<string, string> = { critico: "Crítico", atencao: "Atenção", confiavel: "Confiável" };
    itens.forEach((item, i) => {
      const indicio = indicios[i];
      expect(within(item).getByRole("heading", { level: 3 }).textContent).toBe(indicio.titulo);
      expect(within(item).getByText(indicio.explicacao)).toBeDefined();
      expect(within(item).getByText(rotulos[indicio.gravidade])).toBeDefined();
      expect(item.querySelector("svg")).not.toBeNull();
    });
  });
});

test("e-mail seguro mostra os motivos de confiança", () => {
  guardarComIndicios(5, [ind("Remetente coerente", "confiavel")]);
  render(<ResultadoView />);
  const secao = screen.getByRole("region", { name: "O que encontramos" });
  expect(within(secao).getByText("Confiável")).toBeDefined();
  expect(within(secao).getByText("Remetente coerente")).toBeDefined();
});

test("ordena crítico, atenção e confiável, mesmo se vierem fora de ordem", () => {
  guardarComIndicios(75, [
    ind("C", "confiavel"),
    ind("A", "atencao"),
    ind("K", "critico"),
  ]);
  render(<ResultadoView />);
  const secao = screen.getByRole("region", { name: "O que encontramos" });
  expect(
    within(secao).getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
  ).toEqual(["K", "A", "C"]);
});

test("fica entre o card do veredito e 'O que fazer agora'", () => {
  guardarComIndicios(90, [ind("Pede sua senha", "critico")]);
  render(<ResultadoView />);
  const veredito = screen.getByRole("region", { name: "Este e-mail provavelmente é phishing" });
  const secao = screen.getByRole("region", { name: "O que encontramos" });
  const fazer = screen.getByRole("region", { name: "O que fazer agora" });
  expect(veredito.compareDocumentPosition(secao) & 4).toBeTruthy();
  expect(secao.compareDocumentPosition(fazer) & 4).toBeTruthy();
});

test("sem indícios, a seção não aparece", () => {
  guardarComIndicios(90, []);
  render(<ResultadoView />);
  expect(screen.queryByRole("region", { name: "O que encontramos" })).toBeNull();
});

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

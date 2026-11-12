import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import Home from "../app/page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(cleanup);

test("mostra o nome ClariMail no cabeçalho e o título principal", () => {
  render(<Home />);
  expect(
    within(screen.getByRole("banner")).getByText("ClariMail"),
  ).toBeDefined();
  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "Esse e-mail é mesmo de quem diz ser?",
    }),
  ).toBeDefined();
});

test("o campo de análise aparece logo depois do título (ordem no celular)", () => {
  render(<Home />);
  const title = screen.getByRole("heading", { level: 1 });
  const field = screen.getByLabelText("Conteúdo do e-mail");
  const subtitle = screen.getByText(/receba um parecer em poucos segundos/);

  // DOCUMENT_POSITION_FOLLOWING = 4
  expect(title.compareDocumentPosition(field) & 4).toBeTruthy();
  expect(field.compareDocumentPosition(subtitle) & 4).toBeTruthy();
});

test("mostra os 3 passos de Como funciona", () => {
  render(<Home />);
  const list = screen
    .getByRole("heading", { level: 2, name: "Como funciona" })
    .parentElement!.querySelector("ol")!;
  const items = within(list).getAllByRole("listitem");
  expect(items.map((item) => within(item).getByRole("heading").textContent))
    .toEqual(["Cole o e-mail", "Verificamos os sinais", "Receba o parecer"]);
});

test("não menciona itens fora do escopo da sprint", () => {
  const { container } = render(<Home />);
  const text = container.textContent ?? "";
  for (const forbidden of [
    "SPF",
    "DKIM",
    "DMARC",
    "Para empresas",
    "Entrar",
    "Enviar arquivo",
  ]) {
    expect(text).not.toContain(forbidden);
  }
});

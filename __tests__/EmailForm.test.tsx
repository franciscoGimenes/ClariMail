import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import EmailForm from "@/components/EmailForm";
import { MAX_CARACTERES, MENSAGENS_VALIDACAO } from "@/lib/validacao";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const EMAIL_VALIDO =
  "De: banco@exemplo.test\nSua conta foi bloqueada, confirme sua senha agora.";

beforeEach(() => {
  push.mockReset();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function campo() {
  return screen.getByLabelText("Conteúdo do e-mail") as HTMLTextAreaElement;
}
function botao() {
  return screen.getByRole("button", { name: /Analisar e-mail|Analisando/ });
}

test("o textarea está associado ao label e guarda o texto digitado", () => {
  render(<EmailForm />);
  expect(campo().tagName).toBe("TEXTAREA");
  fireEvent.change(campo(), { target: { value: "Seu banco bloqueou" } });
  expect(campo().value).toBe("Seu banco bloqueou");
});

test("o botão fica desabilitado sem conteúdo ou só com espaços", () => {
  render(<EmailForm />);
  expect(botao()).toHaveProperty("disabled", true);
  expect(screen.getByText(MENSAGENS_VALIDACAO.vazio)).toBeDefined();

  fireEvent.change(campo(), { target: { value: "   \n  " } });
  expect(botao()).toHaveProperty("disabled", true);

  fireEvent.change(campo(), { target: { value: "a" } });
  expect(botao()).toHaveProperty("disabled", false);
});

test("mostra o contador e limita a 10.000 caracteres", () => {
  render(<EmailForm />);
  expect(screen.getByText("0 de 10.000 caracteres")).toBeDefined();
  expect(campo().maxLength).toBe(MAX_CARACTERES);

  fireEvent.change(campo(), {
    target: { value: "x".repeat(MAX_CARACTERES + 50) },
  });
  expect(campo().value).toHaveLength(MAX_CARACTERES);
  expect(
    screen.getByText("10.000 de 10.000 caracteres (limite atingido)"),
  ).toBeDefined();
});

test("texto curto mostra aviso e não chama a API", () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  render(<EmailForm />);

  fireEvent.change(campo(), { target: { value: "oi, tudo bem?" } });
  fireEvent.click(botao());

  expect(screen.getByRole("alert").textContent).toContain(
    MENSAGENS_VALIDACAO.curto,
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

test("envia, mostra 'Analisando…', guarda só o resultado e vai para /resultado", async () => {
  const resultado = {
    veredito: "phishing",
    nota: 90,
    resumo: "Golpe.",
    indicios: [],
  };
  let responder!: (r: Response) => void;
  const fetchMock = vi.fn(
    () => new Promise<Response>((resolve) => (responder = resolve)),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(<EmailForm />);

  fireEvent.change(campo(), { target: { value: EMAIL_VALIDO } });
  fireEvent.click(botao());

  await waitFor(() => expect(botao().textContent).toContain("Analisando…"));
  expect(botao()).toHaveProperty("disabled", true);

  const [url, init] = fetchMock.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  expect(url).toBe("/api/analisar");
  expect(JSON.parse(String(init.body))).toEqual({ texto: EMAIL_VALIDO });

  responder(Response.json(resultado));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/resultado"));

  const salvo = sessionStorage.getItem("clarimail:resultado") ?? "";
  expect(JSON.parse(salvo)).toEqual(resultado);
  expect(salvo).not.toContain("senha agora");
});

test("em erro da API mostra mensagem amigável e não navega", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        { erro: "Não conseguimos analisar agora, tente de novo em instantes." },
        { status: 504 },
      ),
    ),
  );
  render(<EmailForm />);
  fireEvent.change(campo(), { target: { value: EMAIL_VALIDO } });
  fireEvent.click(botao());

  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "Não conseguimos analisar agora",
    ),
  );
  expect(push).not.toHaveBeenCalled();
  expect(botao()).toHaveProperty("disabled", false);
});

test("mostra a nota de privacidade", () => {
  render(<EmailForm />);
  expect(screen.getByText(/analisado e descartado em seguida/)).toBeDefined();
});

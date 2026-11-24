import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import EmailForm from "@/components/EmailForm";
import { MENSAGEM_LIMITE_DIARIO } from "@/lib/limiteTextos";
import { MAX_CARACTERES, MENSAGENS_VALIDACAO } from "@/lib/validacao";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const EMAIL_VALIDO =
  "De: banco@exemplo.test\nSua conta foi bloqueada, confirme sua senha agora.";

/**
 * fetch falso que responde conforme a rota. Por padrão: 5 análises restantes
 * em /api/limite; /api/analisar precisa ser definida pelo teste.
 */
function simularFetch({
  restantes = 5 as number | null,
  analisar = (): Promise<Response> => Promise.reject(new Error("sem resposta")),
} = {}) {
  const fetchMock = vi.fn((url: string) => {
    if (url === "/api/limite") {
      return Promise.resolve(
        restantes === null
          ? Response.json({ erro: "x" }, { status: 503 })
          : Response.json({ restantes }),
      );
    }
    return analisar();
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    fetchMock,
    chamadasAnalisar: () =>
      fetchMock.mock.calls.filter(([url]) => url === "/api/analisar") as unknown as [
        string,
        RequestInit,
      ][],
  };
}

beforeEach(() => {
  push.mockReset();
  sessionStorage.clear();
  simularFetch();
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

test("texto curto mostra aviso e não chama a API de análise", () => {
  const { chamadasAnalisar } = simularFetch();
  render(<EmailForm />);

  fireEvent.change(campo(), { target: { value: "oi, tudo bem?" } });
  fireEvent.click(botao());

  expect(screen.getByRole("alert").textContent).toContain(
    MENSAGENS_VALIDACAO.curto,
  );
  expect(chamadasAnalisar()).toHaveLength(0);
});

test("envia, mostra 'Analisando…', guarda só o resultado e vai para /resultado", async () => {
  const resultado = {
    veredito: "phishing",
    nota: 90,
    resumo: "Golpe.",
    indicios: [],
  };
  let responder!: (r: Response) => void;
  const { chamadasAnalisar } = simularFetch({
    analisar: () => new Promise<Response>((resolve) => (responder = resolve)),
  });
  render(<EmailForm />);

  fireEvent.change(campo(), { target: { value: EMAIL_VALIDO } });
  fireEvent.click(botao());

  await waitFor(() => expect(botao().textContent).toContain("Analisando…"));
  expect(botao()).toHaveProperty("disabled", true);

  const [[url, init]] = chamadasAnalisar();
  expect(url).toBe("/api/analisar");
  expect(JSON.parse(String(init.body))).toEqual({ texto: EMAIL_VALIDO });

  responder(Response.json(resultado));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/resultado"));

  const salvo = sessionStorage.getItem("clarimail:resultado") ?? "";
  expect(JSON.parse(salvo)).toEqual(resultado);
  expect(salvo).not.toContain("senha agora");
});

test("em erro da API mostra mensagem amigável e não navega", async () => {
  simularFetch({
    analisar: async () =>
      Response.json(
        { erro: "Não conseguimos analisar agora, tente de novo em instantes." },
        { status: 504 },
      ),
  });
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

test("mostra a nota de privacidade logo depois do botão Analisar", () => {
  render(<EmailForm />);
  const nota = screen.getByText(
    "O ClariMail não guarda o seu e-mail. Para a análise, o texto é enviado ao Google Gemini. Evite colar senhas, números de cartão ou documentos.",
  );
  expect(botao().nextElementSibling).toBe(nota.parentElement);
  expect(screen.queryByText(/Nenhum e-mail fica armazenado/)).toBeNull();
});

// ---------------------------------------------------------------------------
// Limite diário
// ---------------------------------------------------------------------------

test("mostra de forma discreta quantas análises ainda restam hoje", async () => {
  simularFetch({ restantes: 7 });
  render(<EmailForm />);
  expect(
    await screen.findByText("Você ainda pode fazer 7 análises hoje."),
  ).toBeDefined();
});

test("usa o singular quando resta 1 análise", async () => {
  simularFetch({ restantes: 1 });
  render(<EmailForm />);
  expect(
    await screen.findByText("Você ainda pode fazer 1 análise hoje."),
  ).toBeDefined();
});

test("com 0 restantes: botão desabilitado e aviso acolhedor na região viva", async () => {
  simularFetch({ restantes: 0 });
  render(<EmailForm />);
  fireEvent.change(campo(), { target: { value: EMAIL_VALIDO } });

  const regiao = screen.getByRole("status");
  expect(regiao.getAttribute("aria-live")).toBe("polite");
  await waitFor(() => expect(regiao.textContent).toBe(MENSAGEM_LIMITE_DIARIO));

  // Aviso com ícone, e o botão desabilitado mesmo com texto no campo.
  expect(regiao.querySelector("svg")).not.toBeNull();
  expect(botao()).toHaveProperty("disabled", true);
  expect(botao().getAttribute("aria-describedby")).toBe(
    regiao.querySelector("p")?.id,
  );
  expect(screen.queryByText(/Você ainda pode fazer/)).toBeNull();
});

test("a região viva já existe vazia antes do aviso (para ser anunciada)", () => {
  render(<EmailForm />);
  expect(screen.getByRole("status").textContent).toBe("");
});

test("se a API responder 429, desabilita o botão e mostra o aviso", async () => {
  const { chamadasAnalisar } = simularFetch({
    restantes: 3,
    analisar: async () =>
      Response.json(
        { motivo: "limite_site", mensagem: MENSAGEM_LIMITE_DIARIO },
        { status: 429 },
      ),
  });
  render(<EmailForm />);
  await screen.findByText("Você ainda pode fazer 3 análises hoje.");
  fireEvent.change(campo(), { target: { value: EMAIL_VALIDO } });
  fireEvent.click(botao());

  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toBe(MENSAGEM_LIMITE_DIARIO),
  );
  expect(botao()).toHaveProperty("disabled", true);
  expect(push).not.toHaveBeenCalled();

  // Novo clique não chama a API de novo.
  fireEvent.click(botao());
  expect(chamadasAnalisar()).toHaveLength(1);
});

test("se não der para consultar o limite, o formulário segue funcionando", async () => {
  simularFetch({ restantes: null });
  render(<EmailForm />);
  fireEvent.change(campo(), { target: { value: EMAIL_VALIDO } });
  await new Promise((r) => setTimeout(r, 20));
  expect(botao()).toHaveProperty("disabled", false);
  expect(screen.queryByText(/Você ainda pode fazer/)).toBeNull();
});

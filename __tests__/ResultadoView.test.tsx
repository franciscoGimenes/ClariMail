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

// ---------------------------------------------------------------------------
// Mensagem analisada com trechos destacados (História 5)
// ---------------------------------------------------------------------------

describe("Mensagem analisada", () => {
  const EMAIL = `De: Banco Aurora <aviso@aurora.example>
Assunto: URGENTE:   sua conta foi bloqueada

Confirme sua SENHA no link http://189.45.12.7/login
<script>alert("oi")</script>`;

  const comTrecho = (titulo: string, gravidade: string, trecho: string | null) => ({
    titulo,
    explicacao: `Explicação de ${titulo}.`,
    gravidade,
    trecho,
    origem: "ia",
  });

  const INDICIOS = [
    comTrecho("Cria pressa", "atencao", "urgente: sua conta foi bloqueada"),
    comTrecho("Pede sua senha", "critico", "confirme sua senha"),
    comTrecho("Remetente conhecido", "confiavel", "Banco Aurora"),
    comTrecho("Trecho inventado", "critico", "digite seu PIN"),
  ];

  beforeEach(async () => {
    const { limparAnaliseEmMemoria } = await import("@/lib/emailMemoria");
    limparAnaliseEmMemoria();
  });

  /** Como no app: sessionStorage sem trechos; texto e trechos só na memória. */
  async function abrirComTexto() {
    const { guardarAnaliseEmMemoria } = await import("@/lib/emailMemoria");
    guardarAnaliseEmMemoria(EMAIL, INDICIOS.map((i) => i.trecho));
    guardarComIndicios(90, INDICIOS.map((i) => ({ ...i, trecho: null })));
    render(<ResultadoView />);
    return screen.getByRole("region", { name: "Mensagem analisada" });
  }

  test("mostra o texto original com os trechos marcados (crítico e atenção)", async () => {
    const card = await abrirComTexto();
    const marcas = card.querySelectorAll("mark");
    expect([...marcas].map((m) => m.textContent)).toEqual([
      "URGENTE:   sua conta foi bloqueada",
      "Confirme sua SENHA",
    ]);
    // Quebras de linha preservadas: o texto inteiro está lá, igual.
    expect(card.querySelector(".whitespace-pre-wrap")!.textContent).toBe(EMAIL);
  });

  test("cada destaque é um botão com o título do indício no aria-label", async () => {
    const card = await abrirComTexto();
    expect(within(card).getByRole("button", { name: "Crítico: Pede sua senha" })).toBeDefined();
    expect(within(card).getByRole("button", { name: "Atenção: Cria pressa" })).toBeDefined();
    // "confiavel" não é destacado; trecho inexistente não é marcado.
    expect(within(card).queryByRole("button", { name: /Remetente conhecido|Trecho inventado/ })).toBeNull();
  });

  test("HTML e script do e-mail aparecem como texto, nunca como elementos", async () => {
    const card = await abrirComTexto();
    expect(card.querySelector("script")).toBeNull();
    expect(card.textContent).toContain('<script>alert("oi")</script>');
  });

  test("tem legenda com cor e texto", async () => {
    const card = await abrirComTexto();
    const legenda = within(card).getByRole("list", { name: "Legenda dos destaques" });
    expect(within(legenda).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Crítico",
      "Atenção",
    ]);
  });

  test("tocar no destaque leva o foco ao indício na lista e o destaca", async () => {
    const card = await abrirComTexto();
    fireEvent.click(within(card).getByRole("button", { name: "Crítico: Pede sua senha" }));

    const lista = screen.getByRole("region", { name: "O que encontramos" });
    const item = within(lista).getByRole("heading", { name: "Pede sua senha" }).closest("li")!;
    expect(document.activeElement).toBe(item);
    expect(item.className).toContain("ring-accent");
  });

  test("'Ver no e-mail' faz o caminho inverso e só aparece em indício destacado", async () => {
    await abrirComTexto();
    const lista = screen.getByRole("region", { name: "O que encontramos" });
    const links = within(lista).getAllByRole("link", { name: /Ver no e-mail/ });
    expect(links).toHaveLength(2); // crítico e atenção com trecho encontrado

    const verSenha = within(lista).getByRole("link", { name: "Ver no e-mail: Pede sua senha" });
    fireEvent.click(verSenha);
    const destaque = screen.getByRole("button", { name: "Crítico: Pede sua senha" });
    expect(document.activeElement).toBe(destaque);
    expect(destaque.className).toContain("ring-accent");
  });

  test("depois de recarregar (sem o texto na memória), mostra o resultado e explica", () => {
    guardarComIndicios(90, INDICIOS.map((i) => ({ ...i, trecho: null })));
    render(<ResultadoView />);
    const card = screen.getByRole("region", { name: "Mensagem analisada" });
    expect(card.textContent).toContain("O ClariMail não guarda o seu e-mail");
    expect(card.querySelector("mark")).toBeNull();
    // O resultado continua lá, e a lista não oferece "Ver no e-mail".
    expect(screen.getByRole("region", { name: "O que encontramos" })).toBeDefined();
    expect(screen.queryByRole("link", { name: /Ver no e-mail/ })).toBeNull();
  });

  test("nem o texto nem os trechos vão para sessionStorage, localStorage ou URL", async () => {
    await abrirComTexto();
    fireEvent.click(screen.getByRole("button", { name: "Crítico: Pede sua senha" }));
    const tudo = (
      JSON.stringify({ ...sessionStorage }) +
      JSON.stringify({ ...localStorage }) +
      document.cookie +
      location.href
    ).toLowerCase();
    for (const pedaco of ["confirme sua senha", "sua conta foi bloqueada", "189.45.12.7", "banco aurora"]) {
      expect(tudo).not.toContain(pedaco);
    }
  });

  test("memória de outra análise (indícios diferentes) não é usada", async () => {
    const { guardarAnaliseEmMemoria } = await import("@/lib/emailMemoria");
    guardarAnaliseEmMemoria("outro e-mail qualquer", ["outro"]);
    guardarComIndicios(90, INDICIOS.map((i) => ({ ...i, trecho: null })));
    render(<ResultadoView />);
    const card = screen.getByRole("region", { name: "Mensagem analisada" });
    expect(card.textContent).toContain("O ClariMail não guarda o seu e-mail");
  });

  test("'Analisar outro e-mail' apaga também o texto da memória", async () => {
    const { lerAnaliseEmMemoria } = await import("@/lib/emailMemoria");
    await abrirComTexto();
    fireEvent.click(screen.getByRole("link", { name: "Analisar outro e-mail" }));
    expect(lerAnaliseEmMemoria()).toBeNull();
  });
});

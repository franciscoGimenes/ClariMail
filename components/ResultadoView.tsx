"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type SVGProps,
} from "react";
import {
  AlertIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
} from "@/components/icons";
import {
  dividirEmPedacos,
  indicesDestacados,
  type Pedaco,
} from "@/lib/destaques";
import {
  assinarAnaliseEmMemoria,
  lerAnaliseEmMemoria,
  limparAnaliseEmMemoria,
} from "@/lib/emailMemoria";
import { nivelPorNota, type Nivel } from "@/lib/nivel";
import {
  ordenarIndicios,
  type Gravidade,
  type Indicio,
} from "@/lib/resultado";
import {
  assinarResultado,
  interpretarResultado,
  lerResultadoBruto,
  limparResultado,
} from "@/lib/resultadoSessao";

type Icone = ComponentType<SVGProps<SVGSVGElement>>;

/** Tudo que muda por nível: sempre cor + texto + ícone, nunca só a cor. */
export const APRESENTACAO: Record<
  Nivel,
  {
    etiqueta: string;
    titulo: string;
    Icone: Icone;
    faixa: string;
    selo: string;
    anel: string;
    nota: string;
    orientacoes: string[];
  }
> = {
  alto: {
    etiqueta: "Risco alto",
    titulo: "Este e-mail provavelmente é phishing",
    Icone: ShieldAlertIcon,
    faixa: "bg-danger",
    selo: "bg-danger-bg text-danger-ink",
    anel: "text-danger",
    nota: "text-danger-ink",
    orientacoes: [
      "Não clique em links nem abra anexos desta mensagem.",
      "Apague a mensagem.",
      "Se você já informou algum dado, troque a senha e ligue para a empresa pelo canal oficial.",
    ],
  },
  medio: {
    etiqueta: "Risco médio",
    titulo: "Este e-mail tem sinais suspeitos",
    Icone: AlertIcon,
    faixa: "bg-warning-ink",
    selo: "bg-warning-bg text-warning-ink",
    anel: "text-warning-ink",
    nota: "text-warning-ink",
    orientacoes: [
      "Não clique em links nem responda antes de confirmar.",
      "Confirme com a empresa por um canal oficial, como o telefone do site ou do cartão.",
      "Na dúvida, peça ajuda a alguém de confiança antes de fazer qualquer coisa.",
    ],
  },
  baixo: {
    etiqueta: "Risco baixo",
    titulo: "Este e-mail parece seguro",
    Icone: ShieldCheckIcon,
    faixa: "bg-safe-ink",
    selo: "bg-safe-bg text-safe-ink",
    anel: "text-safe-ink",
    nota: "text-safe-ink",
    orientacoes: [
      "Pode seguir com a mensagem normalmente.",
      "Mesmo assim, desconfie se aparecer pedido de senha, código ou pagamento.",
    ],
  },
};

export default function ResultadoView() {
  const router = useRouter();
  const bruto = useSyncExternalStore(
    assinarResultado,
    lerResultadoBruto,
    () => undefined, // no servidor ainda não sabemos
  );
  // Texto do e-mail e trechos: só na memória da aba (somem ao recarregar).
  const memoria = useSyncExternalStore(
    assinarAnaliseEmMemoria,
    lerAnaliseEmMemoria,
    () => null,
  );
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const resultado = useMemo(
    () => (bruto === undefined ? null : interpretarResultado(bruto)),
    [bruto],
  );
  const [ativo, setAtivo] = useState<Ativo | null>(null);

  // A memória só vale se for desta análise (mesma quantidade de indícios).
  const memoriaValida =
    memoria && resultado && memoria.trechos.length === resultado.indicios.length
      ? memoria
      : null;

  // Devolve os trechos (da memória) aos indícios e ordena: crítico, atenção,
  // confiável. A mesma ordem vale para a lista e para os destaques.
  const indicios = useMemo(
    () =>
      resultado
        ? ordenarIndicios(
            resultado.indicios.map((indicio, i) => ({
              ...indicio,
              trecho: memoriaValida?.trechos[i] ?? null,
            })),
          )
        : [],
    [resultado, memoriaValida],
  );
  const pedacos = useMemo(
    () => (memoriaValida ? dividirEmPedacos(memoriaValida.texto, indicios) : null),
    [memoriaValida, indicios],
  );
  const destacados = useMemo(
    () => (pedacos ? indicesDestacados(pedacos) : new Set<number>()),
    [pedacos],
  );
  const semResultado = bruto !== undefined && resultado === null;
  const temResultado = resultado !== null;

  // Sem resultado em memória (aba nova, link direto): volta para o início.
  useEffect(() => {
    if (semResultado) router.replace("/");
  }, [semResultado, router]);

  // Leva o foco ao título para leitores de tela anunciarem o resultado.
  useEffect(() => {
    if (temResultado) tituloRef.current?.focus();
  }, [temResultado]);

  if (!resultado) {
    return (
      <p role="status" className="text-ink-soft">
        Carregando resultado…
      </p>
    );
  }

  const nivel = nivelPorNota(resultado.nota);
  const visual = APRESENTACAO[nivel];

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/"
        onClick={() => {
          limparResultado();
          limparAnaliseEmMemoria();
        }}
        className="inline-flex min-h-11 items-center gap-2 self-start rounded-button font-semibold text-accent hover:text-accent-hover hover:underline"
      >
        <ArrowLeftIcon className="size-5" />
        Analisar outro e-mail
      </Link>

      <section
        aria-labelledby="titulo-veredito"
        className="relative overflow-hidden rounded-card border border-border bg-surface shadow-[0_8px_24px_rgba(14,21,37,0.06)]"
      >
        <div aria-hidden="true" className={`h-1.5 ${visual.faixa}`} />
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:gap-8 sm:p-8">
          <div className="min-w-0 flex-1">
            <p
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-semibold ${visual.selo}`}
            >
              <visual.Icone className="size-5 shrink-0" />
              {visual.etiqueta}
            </p>
            <h1
              id="titulo-veredito"
              ref={tituloRef}
              tabIndex={-1}
              className="mt-4 text-3xl leading-tight font-semibold text-ink sm:text-4xl"
            >
              {visual.titulo}
            </h1>
            <p className="mt-4 text-lg text-ink-soft">{resultado.resumo}</p>
          </div>

          <AnelNota nota={resultado.nota} corAnel={visual.anel} corNota={visual.nota} />
        </div>
      </section>

      <div
        className={`grid gap-6 ${indicios.length > 0 ? "lg:grid-cols-2 lg:items-start" : ""}`}
      >
        {indicios.length > 0 ? (
          <SecaoIndicios
            indicios={indicios}
            destacados={destacados}
            ativo={ativo?.lado === "lista" ? ativo.indice : null}
            onVerNoEmail={(indice) => {
              irPara(`destaque-${indice}`);
              setAtivo({ lado: "email", indice });
            }}
          />
        ) : null}
        <MensagemAnalisada
          pedacos={pedacos}
          indicios={indicios}
          ativo={ativo?.lado === "email" ? ativo.indice : null}
          onAbrirIndicio={(indice) => {
            irPara(`indicio-${indice}`);
            setAtivo({ lado: "lista", indice });
          }}
        />
      </div>

      <section
        aria-labelledby="titulo-o-que-fazer"
        className="rounded-card bg-ink p-6 text-white sm:p-8"
      >
        <h2 id="titulo-o-que-fazer" className="text-2xl font-semibold">
          O que fazer agora
        </h2>
        <ul className="mt-4 flex flex-col gap-3">
          {visual.orientacoes.map((orientacao) => (
            <li key={orientacao} className="flex gap-3 text-lg">
              <ArrowRightIcon className="mt-1 size-5 shrink-0" />
              <span>{orientacao}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-base text-ink-soft">
        Resultado automatizado. Em caso de dúvida, confirme sempre pelo canal
        oficial da empresa.
      </p>
    </div>
  );
}

/** Gravidade: sempre ícone + rótulo de texto + cor, nunca só a cor. */
export const GRAVIDADE_VISUAL: Record<
  Gravidade,
  { rotulo: string; Icone: Icone; selo: string; caixaIcone: string }
> = {
  critico: {
    rotulo: "Crítico",
    Icone: ShieldAlertIcon,
    selo: "bg-danger-bg text-danger-ink",
    caixaIcone: "bg-danger-bg text-danger-ink",
  },
  atencao: {
    rotulo: "Atenção",
    Icone: AlertIcon,
    selo: "bg-warning-bg text-warning-ink",
    caixaIcone: "bg-warning-bg text-warning-ink",
  },
  confiavel: {
    rotulo: "Confiável",
    Icone: ShieldCheckIcon,
    selo: "bg-safe-bg text-safe-ink",
    caixaIcone: "bg-safe-bg text-safe-ink",
  },
};

type Ativo = { lado: "lista" | "email"; indice: number };

/** Rola até o elemento (suave, se a pessoa não pediu menos movimento) e foca nele. */
function irPara(id: string) {
  const alvo = document.getElementById(id);
  if (!alvo) return;
  const poucoMovimento = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  alvo.scrollIntoView?.({
    behavior: poucoMovimento ? "auto" : "smooth",
    block: "center",
  });
  alvo.focus({ preventScroll: true });
}

function SecaoIndicios({
  indicios,
  destacados,
  ativo,
  onVerNoEmail,
}: {
  indicios: readonly Indicio[];
  destacados: ReadonlySet<number>;
  ativo: number | null;
  onVerNoEmail: (indice: number) => void;
}) {
  return (
    <section
      aria-labelledby="titulo-indicios"
      className="rounded-card border border-border bg-surface p-6 sm:p-8"
    >
      <h2 id="titulo-indicios" className="text-2xl font-semibold text-ink">
        O que encontramos
      </h2>
      <ul className="mt-2 divide-y divide-border">
        {indicios.map((indicio, i) => {
          const visual = GRAVIDADE_VISUAL[indicio.gravidade];
          return (
            <li
              key={i}
              id={`indicio-${i}`}
              tabIndex={-1}
              className={`-mx-3 flex gap-4 rounded-button px-3 py-5 transition-colors ${
                ativo === i ? "bg-bg ring-3 ring-accent" : ""
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex size-11 shrink-0 items-center justify-center rounded-button ${visual.caixaIcone}`}
              >
                <visual.Icone className="size-6" />
              </span>
              <div className="min-w-0">
                <p
                  className={`inline-flex items-center rounded-full px-3 py-0.5 text-base font-semibold ${visual.selo}`}
                >
                  {visual.rotulo}
                </p>
                <h3 className="mt-2 text-lg font-bold text-ink">
                  {indicio.titulo}
                </h3>
                <p className="mt-1 text-base text-ink-soft">
                  {indicio.explicacao}
                </p>
                {destacados.has(i) ? (
                  <a
                    href={`#destaque-${i}`}
                    onClick={(evento) => {
                      evento.preventDefault();
                      onVerNoEmail(i);
                    }}
                    className="mt-1 inline-flex min-h-11 items-center rounded-button font-semibold text-accent underline underline-offset-4 hover:text-accent-hover"
                  >
                    Ver no e-mail
                    <span className="sr-only">: {indicio.titulo}</span>
                  </a>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Destaque no texto: cor + traço embaixo (contínuo ou tracejado), nunca só a cor. */
const MARCA: Record<"critico" | "atencao", string> = {
  critico:
    "bg-danger-bg text-danger-ink border-b-[3px] border-solid border-danger",
  atencao:
    "bg-warning-bg text-warning-ink border-b-[3px] border-dashed border-warning-ink",
};

function MensagemAnalisada({
  pedacos,
  indicios,
  ativo,
  onAbrirIndicio,
}: {
  pedacos: readonly Pedaco[] | null;
  indicios: readonly Indicio[];
  ativo: number | null;
  onAbrirIndicio: (indice: number) => void;
}) {
  const temDestaque = pedacos?.some((p) => p.tipo === "destaque") ?? false;
  // O id do destaque vai só no primeiro pedaço de cada indício.
  const primeiroDe = new Set<number>();

  return (
    <section
      aria-labelledby="titulo-mensagem"
      className="rounded-card border border-border bg-surface p-6 sm:p-8"
    >
      <h2 id="titulo-mensagem" className="text-2xl font-semibold text-ink">
        Mensagem analisada
      </h2>

      {pedacos === null ? (
        <p className="mt-3 text-base text-ink-soft">
          O ClariMail não guarda o seu e-mail. Por isso, depois de recarregar a
          página, os trechos destacados não aparecem mais.
        </p>
      ) : (
        <>
          <p className="mt-2 text-base text-ink-soft">
            {temDestaque
              ? "Toque em um trecho destacado para ver a explicação."
              : "Nenhum trecho foi destacado nesta mensagem."}
          </p>

          {/* Texto montado com elementos React: o e-mail pode ter HTML ou
              script, e aqui ele é sempre mostrado como texto. */}
          <div className="mt-4 rounded-button border border-border bg-bg p-4 text-base leading-loose break-words whitespace-pre-wrap text-ink">
            {pedacos.map((pedaco, k) => {
              if (pedaco.tipo === "texto" || !pedaco.texto.trim()) {
                return <span key={k}>{pedaco.texto}</span>;
              }
              const indicio = indicios[pedaco.indice];
              const rotulo = GRAVIDADE_VISUAL[pedaco.gravidade].rotulo;
              const primeiro = !primeiroDe.has(pedaco.indice);
              primeiroDe.add(pedaco.indice);
              return (
                // O <button> se comporta como um bloco dentro do texto, então a
                // cor e o traço ficam nele (cobrindo todas as linhas do
                // trecho); o <mark> só dá o significado de "destacado".
                <mark key={k} className="bg-transparent text-inherit">
                  <button
                    type="button"
                    id={primeiro ? `destaque-${pedaco.indice}` : undefined}
                    aria-label={`${rotulo}: ${indicio.titulo}`}
                    onClick={() => onAbrirIndicio(pedaco.indice)}
                    className={`inline-block min-h-11 cursor-pointer rounded-sm px-0.5 py-1 text-left align-baseline break-words whitespace-pre-wrap ${MARCA[pedaco.gravidade]} ${
                      ativo === pedaco.indice ? "ring-3 ring-accent" : ""
                    }`}
                  >
                    {pedaco.texto}
                  </button>
                </mark>
              );
            })}
          </div>

          {temDestaque ? (
            <ul
              aria-label="Legenda dos destaques"
              className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-base text-ink"
            >
              <li className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`inline-block h-5 w-8 rounded-sm ${MARCA.critico}`}
                />
                Crítico
              </li>
              <li className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`inline-block h-5 w-8 rounded-sm ${MARCA.atencao}`}
                />
                Atenção
              </li>
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}

const RAIO = 52;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;

function AnelNota({
  nota,
  corAnel,
  corNota,
}: {
  nota: number;
  corAnel: string;
  corNota: string;
}) {
  return (
    <div
      role="img"
      aria-label={`Nota de risco ${nota} de 100`}
      className="relative size-40 shrink-0 self-center"
    >
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
        <circle
          cx="60"
          cy="60"
          r={RAIO}
          fill="none"
          strokeWidth="10"
          className="stroke-border"
        />
        <circle
          cx="60"
          cy="60"
          r={RAIO}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={CIRCUNFERENCIA}
          strokeDashoffset={CIRCUNFERENCIA * (1 - nota / 100)}
          className={nota === 0 ? "hidden" : corAnel}
        />
      </svg>
      <div
        aria-hidden="true"
        className="absolute inset-0 flex flex-col items-center justify-center"
      >
        <span className={`font-mono text-5xl leading-none font-semibold ${corNota}`}>
          {nota}
        </span>
        <span className="mt-1 text-base text-ink-soft">de 100</span>
      </div>
    </div>
  );
}

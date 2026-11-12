"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
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
import { nivelPorNota, type Nivel } from "@/lib/nivel";
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
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const resultado = bruto === undefined ? null : interpretarResultado(bruto);
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
        onClick={limparResultado}
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

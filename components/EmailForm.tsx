"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertIcon, ArrowRightIcon, LockIcon } from "@/components/icons";
import {
  MENSAGEM_LIMITE_DIARIO,
  textoRestantes,
} from "@/lib/limiteTextos";
import { resultadoSchema } from "@/lib/resultado";
import { salvarResultado } from "@/lib/resultadoSessao";
import {
  MAX_CARACTERES,
  MENSAGENS_VALIDACAO,
  validarEntrada,
} from "@/lib/validacao";

const MENSAGEM_FALHA =
  "Não conseguimos analisar agora, tente de novo em instantes.";
const TEMPO_LIMITE_MS = 12_000; // 10 s da análise + folga de rede

const numero = new Intl.NumberFormat("pt-BR");

export default function EmailForm() {
  const router = useRouter();
  const [emailText, setEmailText] = useState("");
  const [analisando, setAnalisando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // Análises que ainda restam hoje (null = ainda não sabemos).
  const [restantes, setRestantes] = useState<number | null>(null);

  const fieldId = useId();
  const hintId = useId();
  const counterId = useId();
  const avisoId = useId();
  const privacyId = useId();
  const limiteId = useId();

  const temConteudo = emailText.trim().length > 0;
  const noLimite = emailText.length >= MAX_CARACTERES;
  const esgotado = restantes === 0;

  // Consulta quantas análises ainda restam hoje para esta pessoa.
  useEffect(() => {
    const controle = new AbortController();
    fetch("/api/limite", { signal: controle.signal, cache: "no-store" })
      .then((resposta) => (resposta.ok ? resposta.json() : null))
      .then((dados: unknown) => {
        if (
          dados &&
          typeof dados === "object" &&
          "restantes" in dados &&
          typeof dados.restantes === "number"
        ) {
          setRestantes(dados.restantes);
        }
      })
      .catch(() => {
        // Sem a informação, o formulário segue funcionando normalmente.
      });
    return () => controle.abort();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (analisando || esgotado) return;

    // Valida no navegador primeiro: texto vazio ou curto não chama a IA.
    const entrada = validarEntrada({ texto: emailText });
    if (!entrada.ok) {
      setAviso(entrada.erro);
      return;
    }

    setAviso(null);
    setAnalisando(true);
    try {
      const resposta = await fetch("/api/analisar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: entrada.texto }),
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });
      const dados: unknown = await resposta.json().catch(() => null);

      // Limite diário esgotado (do site, da pessoa ou do próprio Gemini).
      if (resposta.status === 429) {
        setRestantes(0);
        return;
      }

      if (!resposta.ok) {
        const erro =
          dados && typeof dados === "object" && "erro" in dados
            ? String(dados.erro)
            : MENSAGEM_FALHA;
        setAviso(erro);
        return;
      }

      const resultado = resultadoSchema.safeParse(dados);
      if (!resultado.success) {
        setAviso(MENSAGEM_FALHA);
        return;
      }

      salvarResultado(resultado.data);
      router.push("/resultado");
    } catch {
      setAviso(MENSAGEM_FALHA);
    } finally {
      setAnalisando(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Analisar e-mail"
      aria-busy={analisando}
      noValidate
    >
      <label
        htmlFor={fieldId}
        className="block text-lg font-semibold text-ink"
      >
        Conteúdo do e-mail
      </label>
      <p id={hintId} className="mt-1 text-base text-ink-soft">
        Copie todo o texto do e-mail, incluindo quem enviou, e cole aqui.
      </p>

      <textarea
        id={fieldId}
        name="email"
        value={emailText}
        onChange={(event) => {
          setEmailText(event.target.value.slice(0, MAX_CARACTERES));
          if (aviso) setAviso(null);
        }}
        maxLength={MAX_CARACTERES}
        readOnly={analisando}
        aria-describedby={`${hintId} ${counterId}${aviso ? ` ${avisoId}` : ""} ${privacyId}`}
        aria-invalid={aviso ? true : undefined}
        rows={7}
        spellCheck={false}
        className="mt-3 block min-h-44 w-full resize-y rounded-button border border-border bg-surface px-4 py-3 text-base text-ink focus:border-accent aria-invalid:border-danger"
      />

      <p
        id={counterId}
        className={`mt-2 text-right text-base ${noLimite ? "font-semibold text-danger-ink" : "text-ink-soft"}`}
      >
        {numero.format(emailText.length)} de {numero.format(MAX_CARACTERES)}{" "}
        caracteres
        {noLimite ? " (limite atingido)" : ""}
      </p>

      {aviso ? (
        <p
          id={avisoId}
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-button bg-warning-bg px-4 py-3 text-base text-warning-ink"
        >
          <AlertIcon className="mt-0.5 size-5 shrink-0" />
          <span>{aviso}</span>
        </p>
      ) : null}

      {restantes !== null && !esgotado ? (
        <p className="mt-3 text-base text-ink-soft">
          {textoRestantes(restantes)}
        </p>
      ) : null}

      {/* Região viva sempre presente, para o leitor de tela anunciar o aviso
          quando ele aparecer. */}
      <div role="status" aria-live="polite" aria-atomic="true">
        {esgotado ? (
          <p
            id={limiteId}
            className="mt-3 flex items-start gap-3 rounded-button border border-warning-ink bg-warning-bg px-4 py-3 text-base text-warning-ink"
          >
            <AlertIcon className="mt-0.5 size-6 shrink-0" />
            <span>{MENSAGEM_LIMITE_DIARIO}</span>
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={!temConteudo || analisando || esgotado}
        aria-describedby={esgotado ? limiteId : undefined}
        className="mt-4 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-button bg-accent px-6 text-lg font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-border disabled:text-ink-soft"
      >
        {analisando ? (
          <>
            <SpinnerIcon />
            Analisando…
          </>
        ) : (
          <>
            Analisar e-mail
            <ArrowRightIcon className="size-5" />
          </>
        )}
      </button>

      <p
        id={privacyId}
        className="mt-3 flex items-start gap-2 text-base text-ink-soft"
      >
        <LockIcon className="mt-0.5 size-5 shrink-0" />
        <span>
          O ClariMail não guarda o seu e-mail. Para a análise, o texto é
          enviado ao Google Gemini. Evite colar senhas, números de cartão ou
          documentos.
        </span>
      </p>

      {!temConteudo && !esgotado ? (
        <p className="mt-2 text-base text-ink-soft">
          {MENSAGENS_VALIDACAO.vazio}
        </p>
      ) : null}
    </form>
  );
}

function SpinnerIcon() {
  return (
    <svg
      className="size-5 animate-spin motion-reduce:animate-none"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

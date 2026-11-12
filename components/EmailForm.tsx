"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertIcon, ArrowRightIcon, LockIcon } from "@/components/icons";
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

  const fieldId = useId();
  const hintId = useId();
  const counterId = useId();
  const avisoId = useId();
  const privacyId = useId();

  const temConteudo = emailText.trim().length > 0;
  const noLimite = emailText.length >= MAX_CARACTERES;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (analisando) return;

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

      <button
        type="submit"
        disabled={!temConteudo || analisando}
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

      {!temConteudo ? (
        <p className="mt-2 text-base text-ink-soft">
          {MENSAGENS_VALIDACAO.vazio}
        </p>
      ) : null}

      <p
        id={privacyId}
        className="mt-4 flex items-start gap-2 text-base text-ink-soft"
      >
        <LockIcon className="mt-0.5 size-5 shrink-0" />
        <span>
          O conteúdo é analisado e descartado em seguida. Nenhum e-mail fica
          armazenado.
        </span>
      </p>
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

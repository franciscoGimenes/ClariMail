import EmailForm from "@/components/EmailForm";
import { CheckIcon } from "@/components/icons";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

const benefits = [
  "Veredito claro: golpe, suspeito ou seguro",
  "Nota de risco que mostra o tamanho do perigo",
  "Explicação em linguagem simples, sem termos técnicos",
];

const steps = [
  {
    number: "01",
    title: "Cole o e-mail",
    text: "Copie o texto do e-mail que deixou você em dúvida e cole no campo de análise.",
  },
  {
    number: "02",
    title: "Verificamos os sinais",
    text: "Olhamos quem enviou, os links, os pedidos de dados pessoais e o tom de urgência, que são sinais comuns de golpe.",
  },
  {
    number: "03",
    title: "Receba o parecer",
    text: "Você vê se o e-mail é golpe, suspeito ou seguro, com o motivo de cada ponto explicado.",
  },
];

export default function Home() {
  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        {/*
          Hero: no celular a ordem é título -> formulário -> explicação,
          para o campo aparecer logo abaixo do título. No desktop vira
          duas colunas, com o formulário à direita.
        */}
        <section className="mx-auto grid max-w-6xl gap-x-12 gap-y-8 px-4 py-8 sm:px-6 lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:py-10">
          <div className="lg:col-start-1 lg:row-start-1">
            <p className="font-mono text-base font-medium uppercase tracking-wide text-accent">
              Análise de e-mails suspeitos
            </p>
            <h1 className="mt-3 text-4xl leading-tight font-semibold text-ink sm:text-5xl">
              Esse e-mail é mesmo de quem diz ser?
            </h1>
          </div>

          <div className="rounded-card border border-border bg-surface p-5 shadow-[0_8px_24px_rgba(14,21,37,0.06)] sm:p-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
            <EmailForm />
          </div>

          <div className="lg:col-start-1 lg:row-start-2">
            <p className="text-xl text-ink-soft">
              Cole o texto do e-mail e receba um parecer em poucos segundos,
              com cada sinal de perigo explicado em palavras simples.
            </p>
            <ul className="mt-6 space-y-3">
              {benefits.map((benefit) => (
                <li key={benefit} className="flex items-start gap-3 text-ink">
                  <CheckIcon className="mt-0.5 size-6 shrink-0 text-accent" />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          aria-labelledby="como-funciona"
          className="border-t border-border"
        >
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
            <h2
              id="como-funciona"
              className="text-3xl font-semibold text-ink"
            >
              Como funciona
            </h2>
            <ol className="mt-8 grid gap-6 md:grid-cols-3">
              {steps.map((step) => (
                <li
                  key={step.number}
                  className="rounded-card border border-border bg-surface p-6"
                >
                  <span
                    aria-hidden="true"
                    className="font-mono text-lg font-medium text-accent"
                  >
                    {step.number}
                  </span>
                  <h3 className="mt-2 text-xl font-semibold text-ink">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-ink-soft">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

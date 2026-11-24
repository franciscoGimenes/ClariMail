# ClariMail

O ClariMail é uma plataforma web que identifica e-mails de golpe (phishing) e explica, em linguagem simples, por que uma mensagem é perigosa ou segura. A explicação é feita com IA Explicável.

O público principal são pessoas com pouca familiaridade com tecnologia, em especial adultos mais velhos e idosos. Por isso a interface é toda em português do Brasil, com letras grandes, bom contraste e linguagem sem termos técnicos.

**Privacidade:** o ClariMail não guarda o e-mail nem registra o texto em logs. Para a análise, o texto é enviado ao Google Gemini. No plano gratuito, o Google pode usar o conteúdo enviado para melhorar os produtos dele, por isso a tela pede para a pessoa evitar colar senhas, números de cartão ou documentos.

Projeto acadêmico da disciplina de Métodos Ágeis, desenvolvido com Scrum.

## Tecnologias

- [Next.js](https://nextjs.org) (App Router) com TypeScript
- Tailwind CSS
- API gratuita do Google Gemini (`@google/genai`), chamada apenas pelo servidor
- Vitest e Testing Library para testes unitários
- Deploy na Vercel

## Como rodar localmente

Pré-requisitos: Node.js 20.9 ou superior (recomendado: 24) e npm.

```bash
# 1. Instale as dependências
npm install

# 2. Crie o arquivo de variáveis de ambiente
cp .env.example .env.local
# depois, abra o .env.local e preencha GEMINI_API_KEY e GEMINI_MODEL
# (a chave é gerada em https://aistudio.google.com/apikey)

# 3. Rode o servidor de desenvolvimento
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) no navegador.

### Outros comandos

| Comando | O que faz |
|---|---|
| `npm run lint` | Verifica o código com o ESLint |
| `npm test` | Roda os testes unitários uma vez |
| `npm run test:watch` | Roda os testes em modo observação |
| `npm run fixtures` | Analisa os e-mails de exemplo de `tests/fixtures/emails` e mostra nota e veredito (`-- --sim` força a simulação) |
| `npm run build` | Gera a versão de produção |
| `npm start` | Sobe a versão de produção (depois do build) |

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `GEMINI_API_KEY` | Sim | Chave da API do Google Gemini (Google AI Studio). Fica só no servidor e nunca é enviada ao navegador. |
| `GEMINI_MODEL` | Sim, se `MODELO_PADRAO` estiver vazio | Nome do modelo Flash usado na análise. Sem ela, vale a constante `MODELO_PADRAO` de `lib/analisador.ts`. |

**Limite do plano gratuito:** quando a cota diária do Gemini acaba, a análise responde "O ClariMail atingiu o limite de análises de hoje. Tente de novo amanhã."

**Sem chave em desenvolvimento:** se a `GEMINI_API_KEY` não estiver definida, o `npm run dev` usa um **analisador de simulação** com regras simples (palavras de urgência, pedido de senha/CPF, links). Ele serve só para testar o fluxo. O resumo aparece com o prefixo "[Simulação]". Em produção (incluindo `npm start`), a chave é obrigatória.

Os arquivos `.env*` estão no `.gitignore`, então **nunca faça commit de chaves**. O modelo de referência é o `.env.example`.

## Como o time trabalha

- Uma branch por card do Trello, com o nome `feat/<nome-curto>`.
- Pull Request revisado por outro integrante antes do merge na `main`.
- Commits em português, curtos e no imperativo.
- **Definition of Done:** critérios de aceite testados, PR revisado, funcionando no celular e no computador sem erros no console, publicado na Vercel.

## Integrantes

| Nome | Papel |
|---|---|
| Francisco Carlos Gimenes Neto | Scrum Master |
| Pedro Henrique Aquileira Silva | Desenvolvedor |
| Vinicius Henrique Silva Bonfim | Desenvolvedor |

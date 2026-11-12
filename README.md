# ClariMail

O ClariMail é uma plataforma web que identifica e-mails de golpe (phishing) e explica, em linguagem simples, por que uma mensagem é perigosa ou segura. A explicação é feita com IA Explicável.

O público principal são pessoas com pouca familiaridade com tecnologia, em especial adultos mais velhos e idosos. Por isso a interface é toda em português do Brasil, com letras grandes, bom contraste e linguagem sem termos técnicos.

**Privacidade:** o conteúdo do e-mail é usado só para a análise e depois é descartado. Ele nunca é salvo nem registrado em logs.

Projeto acadêmico da disciplina de Métodos Ágeis, desenvolvido com Scrum.

## Tecnologias

- [Next.js](https://nextjs.org) (App Router) com TypeScript
- Tailwind CSS
- API da Anthropic (`@anthropic-ai/sdk`), chamada apenas pelo servidor
- Vitest e Testing Library para testes unitários
- Deploy na Vercel

## Como rodar localmente

Pré-requisitos: Node.js 20.9 ou superior (recomendado: 24) e npm.

```bash
# 1. Instale as dependências
npm install

# 2. Crie o arquivo de variáveis de ambiente
cp .env.example .env.local
# depois, abra o .env.local e preencha a ANTHROPIC_API_KEY

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
| `ANTHROPIC_API_KEY` | Sim | Chave da API da Anthropic. Fica só no servidor e nunca é enviada ao navegador. |
| `ANTHROPIC_MODEL` | Não | Modelo usado na análise. Padrão: `claude-haiku-5-5`. |

**Sem chave em desenvolvimento:** se a `ANTHROPIC_API_KEY` não estiver definida, o `npm run dev` usa um **analisador de simulação** com regras simples (palavras de urgência, pedido de senha/CPF, links). Ele serve só para testar o fluxo. O resumo aparece com o prefixo "[Simulação]". Em produção (incluindo `npm start`), a chave é obrigatória.

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

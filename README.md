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
| `LIMITE_DIARIO_SITE` | Não | Máximo de análises do site inteiro por dia. Padrão: `150`. |
| `LIMITE_DIARIO_IP` | Não | Máximo de análises por pessoa (IP) por dia. Padrão: `10`. |
| `LIMITE_SAL` | Sim, em produção | Sal do hash SHA-256 do IP. O IP nunca é guardado puro. Gere com `openssl rand -hex 32`. |
| `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` | Sim, em produção | Upstash Redis, onde ficam os contadores do limite. Também valem `KV_REST_API_URL` e `KV_REST_API_TOKEN`, os nomes que a integração Upstash da Vercel cria. |

**Limite diário:** para não estourar a cota gratuita do Gemini, o ClariMail aceita até `LIMITE_DIARIO_SITE` análises por dia no site e `LIMITE_DIARIO_IP` por pessoa. O dia vira à meia-noite de São Paulo (America/Sao_Paulo). Só conta a análise que chega a chamar a IA: texto vazio, curto ou inválido não gasta. Também não gasta quando o Gemini não analisou o e-mail (sobrecarregado, erro 503, ou acima do limite por minuto). Quando o limite acaba, o botão fica desabilitado e a tela avisa que o serviço volta amanhã. O 429 do Gemini é tratado conforme a cota: se acabou a cota **do dia**, o site fica esgotado até a meia-noite e o Gemini não é chamado de novo; se foi o limite **por minuto**, a tela pede para esperar um minuto e o botão continua habilitado. Pessoas na mesma rede (mesmo IP) dividem o limite por pessoa, que pode ser ajustado em `LIMITE_DIARIO_IP`. Em desenvolvimento, a simulação também conta no limite, para dar para testar o aviso localmente. `GET /api/limite` informa quantas análises ainda restam para a pessoa. Em desenvolvimento, sem Upstash, os contadores ficam em memória e zeram quando o servidor reinicia.

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

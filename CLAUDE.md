# ClariMail

Projeto de faculdade da disciplina de Métodos Ágeis (Scrum).

## Produto

- **ClariMail**: plataforma web que detecta phishing em e-mails e explica, em linguagem simples, por que a mensagem é perigosa ou segura (IA Explicável).
- **Público**: pessoas leigas em tecnologia, principalmente adultos mais velhos e idosos.
- **Tom**: acolhedor, direto e sem jargão técnico. A interface é só em português do Brasil.
- **Privacidade**: o conteúdo do e-mail é analisado e descartado. **Nunca salvar e nunca logar o texto do e-mail.** Isso vale para banco de dados, arquivos, `console.log`, logs de erro e serviços de terceiros, exceto a chamada de análise ao Google Gemini. No plano gratuito, o Google pode usar o conteúdo enviado para melhorar os produtos dele, e a interface avisa isso à pessoa perto do botão Analisar.

## Stack

- Next.js (App Router), TypeScript e Tailwind CSS.
- A análise roda numa rota de API do próprio Next (server-side), que chama a API gratuita do Google Gemini pelo SDK oficial `@google/genai`. A chave nunca vai para o cliente.
- Variáveis de ambiente:
  - `GEMINI_API_KEY`
  - `GEMINI_MODEL` (sem padrão fixo no código; se faltar, usa a constante `MODELO_PADRAO` de `lib/analisador.ts`)
  - `LIMITE_DIARIO_SITE` (padrão 150) e `LIMITE_DIARIO_IP` (padrão 10)
  - `LIMITE_SAL` (sal do hash do IP; obrigatório em produção)
  - `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` ou `KV_REST_API_URL` / `KV_REST_API_TOKEN` (Upstash Redis; obrigatório em produção, em desenvolvimento usa memória)
- **Limite diário** (`lib/limite.ts`): limite do site e por IP, conferidos e somados de forma atômica antes de chamar a IA. O dia vira à meia-noite de America/Sao_Paulo e as chaves expiram em 48 h. Só conta a análise que chega a chamar a IA. O IP é guardado só como hash SHA-256 com sal, nunca puro, e nunca vai para logs. Esgotado o limite, a rota responde 429 com `{ motivo: "limite_site" | "limite_ip", mensagem }`, e o formulário desabilita o botão e mostra o aviso. 429 do Gemini pela cota do dia esgota o site até a meia-noite; pelo limite por minuto, responde 503 "espere um minuto" e devolve a análise. 503 do Gemini também devolve a análise.
- Deploy na Vercel.

## Identidade visual (vem do protótipo do time)

### Fontes

IBM Plex Sans para o texto e IBM Plex Mono para detalhes técnicos, carregadas via `next/font/google`.

### Cores

| Uso | Fundo | Texto / cor |
|---|---|---|
| Fundo da página | `#F4F5F7` | |
| Superfícies (cards) | `#FFFFFF` | |
| Bordas | `#E1E4EA` | |
| Texto principal | | `#0E1525` |
| Texto secundário | | `#3B4458` |
| Destaque / ação | | `#2457F5` |
| Perigo | `#FDECE4` | `#9A2E0A` (cor de destaque `#D4501C`) |
| Atenção | `#FFF4D6` | `#7A5200` |
| Seguro | `#E3F4E8` | `#1E6B3A` |

### Componentes

- Cards brancos com borda de 1px e raio de 16px.
- Botões com 52px de altura e raio de 10px.

### Acessibilidade (obrigatório)

- Fonte base de no mínimo 18px.
- Contraste WCAG AA.
- Alvos de toque com no mínimo 44px.
- Nunca usar só a cor para passar informação. Sempre combinar cor, texto e ícone.
- Sem emoji. Ícones em SVG inline com traço (stroke).

## Como o time trabalha

- Uma branch por card do Trello: `feat/<nome-curto>`.
- Pull Request revisado por outro integrante antes do merge na `main`.
- **Definition of Done**: critérios de aceite testados, PR revisado, funcionando no celular e no computador sem erros no console, publicado na Vercel.
- Commits em português, curtos e no imperativo (ex.: "Adiciona tela de resultado").

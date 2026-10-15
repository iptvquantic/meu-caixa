# Meu Caixa

Controle de caixa para autônomos e pequenos negócios: entradas, saídas, cartão de crédito (parcelas e faturas), investimentos, contas fixas, metas e um assistente com IA que lança por voz, texto ou foto do comprovante tirada na hora, descobrindo sozinho se é entrada, saída, cartão ou investimento (no app e, opcionalmente, no WhatsApp). Funciona no celular e no PC e pode ser instalado como app.

- Site: https://iptvquantic.github.io/meu-caixa/
- App: https://iptvquantic.github.io/meu-caixa/app.html

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | Página de apresentação e planos. Quem já tem conta no aparelho (ou abre o app instalado) vai direto para o `app.html`; `?site=1` mostra a página mesmo assim |
| `app.html` | O aplicativo inteiro (HTML, CSS e JavaScript num arquivo só) |
| `manifest.webmanifest`, `sw.js`, `*.png` | App instalável: nome, ícones e abertura sem internet |
| `novo.html` | Endereço antigo; leva para o `app.html` |
| `CHANGELOG.md` | O que mudou em cada versão |
| `dev/` | Testes, banco (Supabase) e funções da IA e do robô do WhatsApp — não é carregado pelo app ([como usar](dev/README.md)) |

## Como funciona

- Login e dados no Supabase (São Paulo). Cada pessoa só acessa os próprios dados: a regra fica no banco (Row Level Security), não no navegador.
- A IA, o assistente (voz, texto e foto) e o robô do WhatsApp rodam em funções do Supabase. Nenhuma chave secreta fica neste repositório; o `app.html` só leva o endereço e a chave pública do Supabase. A foto do comprovante é reduzida no aparelho, lida pela IA e descartada: não é guardada em lugar nenhum.
- Publicação: GitHub Pages a partir do `main`. Ao mudar o `app.html`, suba também a `VERSION` do `sw.js` para os aparelhos instalados pegarem a atualização.
- Antes de publicar: `cd dev && npm ci && npm run test:all` (detalhes em [dev/README.md](dev/README.md)).

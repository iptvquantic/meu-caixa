# Meu Caixa

Controle de caixa para autônomos e pequenos negócios: entradas, saídas, cartão de crédito (parcelas e faturas), investimentos, contas fixas, metas e um conselheiro com IA. Funciona no celular e no PC e pode ser instalado como app.

- Site: https://iptvquantic.github.io/meu-caixa/
- App: https://iptvquantic.github.io/meu-caixa/app.html

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | Página de apresentação e planos |
| `app.html` | O aplicativo inteiro (HTML, CSS e JavaScript num arquivo só) |
| `manifest.webmanifest`, `sw.js`, `*.png` | App instalável: nome, ícones e abertura sem internet |
| `novo.html` | Endereço antigo; leva para o `app.html` |
| `CHANGELOG.md` | O que mudou em cada versão |
| `dev/` | Testes, banco (Supabase) e função da IA — não é carregado pelo app ([como usar](dev/README.md)) |

## Como funciona

- Login e dados no Supabase (São Paulo). Cada pessoa só acessa os próprios dados: a regra fica no banco (Row Level Security), não no navegador.
- A IA roda numa função do Supabase. Nenhuma chave secreta fica neste repositório; o `app.html` só leva o endereço e a chave pública do Supabase.
- Publicação: GitHub Pages a partir do `main`. Ao mudar o `app.html`, suba também a `VERSION` do `sw.js` para os aparelhos instalados pegarem a atualização.
- Antes de publicar: `cd dev && npm ci && npm run test:all` (detalhes em [dev/README.md](dev/README.md)).

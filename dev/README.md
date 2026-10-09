# dev/ — testes e ferramentas do Meu Caixa

Nada desta pasta é carregado pelo app. O produto é só o que está na raiz do repositório
(`app.html` é a fonte da verdade). Aqui ficam os testes, o banco (Supabase) e a função da IA,
para qualquer sessão nova conseguir testar e publicar sem depender do que ficou em outro lugar.

## Preparar

```bash
cd dev && npm ci          # Node 22.6 ou mais novo
```

Navegador dos testes: usa `CHROME_PATH`, senão `/opt/pw-browsers/chromium` (já existe no ambiente da sessão).
Postgres dos testes do banco: qualquer Postgres 15+ local; no ambiente da sessão o `test-db.sh` liga o
Postgres 16 e cria o usuário sozinho.

## Testes

| Comando | O que confere |
|---|---|
| `npm test` | Sintaxe dos scripts, todo `data-act` com função, todo id existente, nenhuma chave secreta; ícones automáticos (farmácia → pílula etc.); a interface inteira em modo demonstração (lançar, parcelar, editar, desfazer, categorias, temas, todas as telas, PDF, migração da versão antiga); contas fixas, metas e Ajustes; backup exportar → restaurar sem duplicar e sem perder nada; resumo enviado à IA |
| `npm run test:browser` | No Chromium, com o Supabase simulado: login, carga das 6 tabelas, gravação, IA pela função; abrir sem internet com os últimos dados (service worker); app instalável (manifest, ícones, atalho) |
| `npm run test:db` | Banco num Postgres real: regras de acesso (RLS), permissões e validações com 5 tipos de usuário; cada migração nova; rodar tudo de novo (idempotente) sem mudar nenhum dado |
| `npm run shots` | Prints em 360/390/1280 px nos 3 temas em `dev/shots/` e aviso se algo vaza na horizontal |
| `npm run demo` | Cópia do app em modo demonstração (dados de exemplo, sem nuvem), usada na prévia |
| `npm run test:all` | Tudo acima, menos a demonstração |

## Banco e IA (`dev/supabase/`)

| Arquivo | Situação na produção (projeto `meu-caixa-br`) |
|---|---|
| `schema.sql` — base 2.0: tabelas, funções, gatilhos, RLS | aplicado (migrações `20261008204728` e `20261008204747`) |
| `migrations/01_v2_1_contas_fixas_metas.sql` | aplicada (`20261008212825`) |
| `migrations/02_v2_1_1_desempenho.sql` — índices, regras de acesso mais baratas, menos privilégios | **pendente** |
| `functions/ai/index.ts` + `context.ts` — função "ai" (Groq) | publicada (versão 5) |

`test/estado.sql` prova que o repositório descreve a produção: monte o banco local só com o que já foi
aplicado e rode o mesmo SELECT na produção pelo conector — as assinaturas por tipo têm que ser iguais
(conferido em 09/10/2026: 10 de 10 iguais).

### Mudar o banco

1. Nova migração em `migrations/NN_vX_Y_nome.sql`: idempotente, nunca apaga dado, prefira `ALTER` a `DROP`.
2. `npm run test:db` passando inteiro.
3. Aplicar na produção pelo conector do Supabase (`apply_migration`) com o mesmo texto.
4. Atualizar `PRODUCAO=NN` no `supabase/test-db.sh` e a tabela acima.
5. Conferir: `estado.sql` local × produção, Advisors (segurança e desempenho) e logs.

## Publicar o app

1. Mudou o `app.html` → subir `MC_CONFIG.version` e o `VERSION` do `sw.js` juntos (os aparelhos com o app instalado só atualizam assim).
2. `npm test && npm run test:browser && npm run shots` e olhar os prints.
3. Commit no `main`: o GitHub Pages publica em cerca de 1 minuto.
4. Conferir no site (versão nova no `app.html` e no `sw.js`), nos logs e nos Advisors do Supabase.

## Regras que não mudam

- No código só a URL e a chave **publicável** do Supabase. Nunca chave secreta (`sb_secret_…`, `service_role`, chave da Groq).
- A Groq só é chamada pela função "ai" (login conferido, limite diário em `ai_consume`, chave em Secrets).
- Plano e validade só mudam no servidor. Toda tabela com RLS.
- Nunca perder dado do usuário: apagar categoria, cartão ou conta fixa não apaga lançamento (testado no `test:db`).

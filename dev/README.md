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
| `npm run test:browser` | No Chromium, com o Supabase simulado: login, carga dos dados, gravação, IA pela função, conectar o WhatsApp com código; abrir sem internet com os últimos dados (service worker); app instalável (manifest, ícones, atalho) |
| `npm run test:db` | Banco num Postgres real: regras de acesso (RLS), permissões e validações com 5 tipos de usuário; segurança do robô (código de conexão, número de cada um, plano vencido, desfazer); cada migração nova; rodar tudo de novo (idempotente) sem mudar nenhum dado |
| `npm run test:bot` | Robô do WhatsApp sem internet: conectar, lançar (texto e áudio), conta fixa, desfazer, consultas, IA, limites, assinatura da Meta, cópias geradas em dia (entra no `npm test`) |
| `npm run test:bot:live` | Robô de ponta a ponta: a função rodando no Deno, falando com as funções reais do banco pelo PostgREST (mesmo servidor do Supabase), Meta e Groq simuladas. Baixa Deno e PostgREST para `dev/.tools` na primeira vez |
| `npm run shots` | Prints em 360/390/1280 px nos 3 temas em `dev/shots/` e aviso se algo vaza na horizontal |
| `npm run demo` | Cópia do app em modo demonstração (dados de exemplo, sem nuvem), usada na prévia |
| `npm run test:all` | Tudo acima, menos a demonstração |
| `npm run sync` | Gera as cópias que o robô usa (`functions/whatsapp/smart.ts` do `app.html` e `context.ts` da IA). Rode depois de mudar o lançamento rápido do app ou as contas da IA |

## Banco e IA (`dev/supabase/`)

| Arquivo | Situação na produção (projeto `meu-caixa-br`) |
|---|---|
| `schema.sql` — base 2.0: tabelas, funções, gatilhos, RLS | aplicado (migrações `20261008204728` e `20261008204747`) |
| `migrations/01_v2_1_contas_fixas_metas.sql` | aplicada (`20261008212825`) |
| `migrations/02_v2_1_1_desempenho.sql` — índices, regras de acesso mais baratas, menos privilégios | aplicada (`20261009112340`) |
| `migrations/03_v2_2_whatsapp.sql` — robô do WhatsApp (números conectados, códigos, mensagens recebidas) | aplicada (`20261009151422`) |
| `functions/ai/index.ts` + `context.ts` — função "ai" (Groq) | publicada (ver "Publicar uma função") |
| `functions/whatsapp/` — robô do WhatsApp (`index.ts` entrada, `handler.ts` Meta, `bot.ts` conversa, `groq.ts` IA/áudio) | publicada (ver "Publicar uma função") |

`test/estado.sql` prova que o repositório descreve a produção: monte o banco local só com o que já foi
aplicado e rode o mesmo SELECT na produção pelo conector — as assinaturas por tipo têm que ser iguais
(conferido em 09/10/2026, antes e depois da migração 02: 10 de 10 iguais).

### Mudar o banco

1. Nova migração em `migrations/NN_vX_Y_nome.sql`: idempotente, nunca apaga dado, prefira `ALTER` a `DROP`.
2. `npm run test:db` passando inteiro.
3. Aplicar na produção pelo conector do Supabase (`apply_migration`) com o mesmo texto.
4. Atualizar `PRODUCAO=NN` no `supabase/test-db.sh` e a tabela acima.
5. Conferir: `estado.sql` local × produção, Advisors (segurança e desempenho) e logs.
   Funções: compare `md5(prosrc)` das funções no banco local de teste e na produção (iguais = mesmo texto).
6. O conector pede aprovação para SQL que apaga (`DELETE`, `DROP`, `TRUNCATE`). Migrações não apagam nada;
   o que precisa apagar linha (desfazer do robô, limpeza) fica nas funções, com id e dono conferidos.

### Publicar uma função (`ai` ou `whatsapp`)

1. Testes passando (`npm test`, `npm run test:bot:live`) e commit com push no `main`.
2. `node fn-deploy.js <commit>` gera `out/deploy/<função>/index.ts`: o `index.ts` da função com os imports
   locais apontando para os arquivos daquele commit no GitHub (repositório público). O script recusa se o commit
   não estiver no `main` ou se algum arquivo local estiver diferente dele.
3. Conferir a entrada gerada rodando de verdade: `WA_FN_DIR=out/deploy/whatsapp npm run test:bot:live`.
4. Publicar pelo conector (`deploy_edge_function`) só esse `index.ts`, com `verify_jwt=false` (as duas funções
   conferem o acesso por conta própria: login na `ai`, assinatura da Meta na `whatsapp`).
5. Conferir `?health=1` da função publicada e os logs.
   Assim o que está no ar é exatamente o commit indicado no topo do `index.ts` publicado.

## Robô do WhatsApp

- Caminho: Meta (WhatsApp Cloud API) → função `whatsapp` (`verify_jwt=false`; cada aviso é conferido pela assinatura
  `X-Hub-Signature-256` com a chave secreta do app da Meta) → funções `wa_*` do banco (só a chave de serviço chama).
- Segredos (Supabase → Edge Functions → Secrets): `WHATSAPP_TOKEN` (token permanente do usuário do sistema da Meta),
  `WHATSAPP_APP_SECRET`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN`, além de `GROQ_API_KEY`.
- Webhook na Meta: URL `https://jgqhtshcuyzytljkmmxd.supabase.co/functions/v1/whatsapp`, token de verificação =
  `WHATSAPP_VERIFY_TOKEN`, campo assinado: `messages`. **Não precisa mexer no painel da Meta**: quando o dono
  (plano master/admin) abre Ajustes, o app chama `POST …/whatsapp?setup=1` com o login dele; a função confere o
  login e o plano, cadastra o webhook do app (`/{app}/subscriptions`, token do app = id|chave secreta), inscreve a
  conta do WhatsApp no app (`/{waba}/subscribed_apps`, conta descoberta pelo `debug_token` ou `WHATSAPP_WABA_ID`)
  e devolve o resultado, que aparece só para o dono. Repetir não muda nada se já estiver certo.
- Toda chamada à Meta leva `appsecret_proof` (HMAC do token com a chave secreta do app).
- Conferir: `…/functions/v1/whatsapp?health=1` (banco alcançado e segredos presentes) e `?info=1` (o que o app vê).
- Custo: responder quem escreveu primeiro é grátis na Meta; transcrição e IA pela Groq contam no limite diário de IA do usuário.
- O usuário conecta em Ajustes → WhatsApp: o app mostra um código de 8 dígitos (vale 15 min, uma vez) e abre o
  WhatsApp com "MC código" já escrito. O robô só responde números conectados e respeita o liga/desliga.

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

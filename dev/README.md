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
| `npm test` | Sintaxe dos scripts, todo `data-act` com função, todo id e todo ícone existentes, nenhuma chave secreta; 2.3 (lançamento sem teclado no celular, menu encolhível, tema Automático, resumo do mês, passos do Início, relatórios); 2.3.2 ("Lançar com IA" no Início e no Novo lançamento, tipo automático com a aba como dica, câmera, liga/desliga); ícones automáticos (farmácia → pílula etc.); a interface inteira em modo demonstração (lançar, parcelar, editar, desfazer, categorias, temas, todas as telas, PDF, migração da versão antiga); contas fixas, metas e Ajustes; backup exportar → restaurar sem duplicar e sem perder nada; resumo enviado à IA |
| `npm run test:browser` | No Chromium, com o Supabase simulado e a CSP do site: login, cadastro direto (`?criar=1`), carga dos dados, gravação, assistente (frase → lançamento com Desfazer), IA pela função, gráfico de Relatórios, conectar o WhatsApp com código, ativação do robô pelo dono; "Lançar com IA" com microfone e câmera de verdade (dispositivos falsos do Chromium): no celular a câmera do aparelho (campo com capture), no computador a webcam dentro do app (desliga depois de fotografar), foto escolhida pela galeria, arquivo que não fica no app; abrir sem internet com os últimos dados (service worker); app instalável (manifest, ícones, atalho); página inicial (quem tem conta vai para o app, links, CSP, prints em `dev/shots/landing-*.png`) |
| `npm run test:db` | Banco num Postgres real: regras de acesso (RLS), permissões e validações com 5 tipos de usuário; segurança do robô (código de conexão, número de cada um, plano vencido, desfazer); cada migração nova; rodar tudo de novo (idempotente) sem mudar nenhum dado |
| `npm run test:bot` | Robô sem internet: conectar, lançar (texto, áudio e foto do comprovante), entender a frase com a IA (plano conferido, PIX x cartão, parcela 3/12, faltou o valor, vários lançamentos, IA fora do ar), transcrição (modelos, vocabulário, silêncio), conta fixa, desfazer, consultas, IA, limites, assinatura da Meta, escolha do número (o de atendimento nunca), ativação com PIN, "pronto para os clientes", assistente pelo app (`?app`: login, limites, arquivos), cópias geradas em dia (entra no `npm test`) |
| `npm run test:fn:live` | As duas funções rodando no Deno de verdade. Robô: falando com as funções reais do banco pelo PostgREST (mesmo servidor do Supabase), Meta e Groq simuladas, inclusive a ativação na Meta, a foto do comprovante e o assistente do app (texto, áudio e foto gravando no banco). IA: chave publicável, login, limite, plano e leitura de comprovante. Baixa Deno e PostgREST para `dev/.tools` na primeira vez. `WA_FN_DIR`/`AI_FN_DIR=out/deploy/<função>` roda a entrada gerada pelo `fn-deploy.js` |
| `npm run shots` | Prints em 360/390/1280 px nos 3 temas em `dev/shots/` e aviso se algo vaza na horizontal |
| `npm run demo` | Cópia do app em modo demonstração (dados de exemplo, sem nuvem), usada na prévia |
| `npm run test:all` | Tudo acima, menos a demonstração |
| `npm run sync` | Gera as cópias que o robô usa (`functions/whatsapp/smart.ts` do `app.html`; `context.ts` e `receipt.ts` da IA). Rode depois de mudar o lançamento rápido do app, as contas ou a leitura de comprovante |

## Banco e IA (`dev/supabase/`)

| Arquivo | Situação na produção (projeto `meu-caixa-br`) |
|---|---|
| `schema.sql` — base 2.0: tabelas, funções, gatilhos, RLS | aplicado (migrações `20261008204728` e `20261008204747`) |
| `migrations/01_v2_1_contas_fixas_metas.sql` | aplicada (`20261008212825`) |
| `migrations/02_v2_1_1_desempenho.sql` — índices, regras de acesso mais baratas, menos privilégios | aplicada (`20261009112340`) |
| `migrations/03_v2_2_whatsapp.sql` — robô do WhatsApp (números conectados, códigos, mensagens recebidas) | aplicada (`20261009151422`) |
| `functions/ai/` — função "ai" (`index.ts` entrada mínima, `main.ts` Conselheiro e comprovante, `context.ts`, `receipt.ts`) | publicada do commit `0ba8ef4` (v16, 15/10/2026) |
| `functions/whatsapp/` — robô e assistente (`index.ts` entrada mínima, `main.ts` ligações, `handler.ts` Meta e app, `bot.ts` conversa, `groq.ts` IA/áudio, `receipt.ts` foto, `smart.ts` lançamento rápido e tipo automático) | publicada do commit `132e38a` (v12, 15/10/2026) |

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

1. Testes passando (`npm test`, `npm run test:fn:live`) e commit com push no `main`.
2. `node fn-deploy.js <commit>` gera `out/deploy/<função>/index.ts`: o `index.ts` da função (4 linhas: a biblioteca
   do Supabase e `start()` do `main.ts`) com o import local apontando para aquele commit no GitHub (repositório
   público). O script recusa se o commit não estiver no `main` ou se algum arquivo local estiver diferente dele.
3. Conferir a entrada gerada rodando de verdade: `WA_FN_DIR=out/deploy/whatsapp node test-bot-live.mjs` e
   `AI_FN_DIR=out/deploy/ai node test-ai-live.mjs`.
4. Publicar pelo conector (`deploy_edge_function`) só esse `index.ts`, com `verify_jwt=false` (as duas funções
   conferem o acesso por conta própria: login na `ai`, assinatura da Meta na `whatsapp`).
5. Conferir `?health=1` da função publicada (`ai`: `ok: true`; `whatsapp`: `db: true`) e os logs.
   Assim o que está no ar é exatamente o commit indicado no topo do `index.ts` publicado.

## Robô do WhatsApp

- Caminho: Meta (WhatsApp Cloud API) → função `whatsapp` (`verify_jwt=false`; cada aviso é conferido pela assinatura
  `X-Hub-Signature-256` com a chave secreta do app da Meta) → funções `wa_*` do banco (só a chave de serviço chama).
- Segredos (Supabase → Edge Functions → Secrets): `WHATSAPP_TOKEN` (token permanente do usuário do sistema da Meta),
  `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` e `GROQ_API_KEY`. Opcionais: `WHATSAPP_PHONE_ID` (o robô acha o
  número sozinho: o conectado da conta), `WHATSAPP_WABA_ID`, `WHATSAPP_PROTECTED` (números que o robô nunca usa;
  padrão: o WhatsApp de atendimento 5522991053813, que fica no celular) e `GROQ_VISION_MODELS`.
- O número do robô tem que ser só dele (chip sem WhatsApp instalado), cadastrado no Gestor do WhatsApp →
  Números de telemóvel → Adicionar número de telemóvel. Se a Meta pedir ativação, o dono ativa com um PIN de 6
  números no próprio app (Ajustes → aviso do robô); a função chama `/{número}/register`.
- O cliente só vê "Conectar meu WhatsApp" quando `?info=1` diz `ready: true`: número conectado na API (não de
  teste) e mensagens chegando (mensagem recebida na última semana, ou webhook e conta inscritos no app).
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

## Assistente no app ("Lançar com IA": falar, escrever ou foto)

- No Início (cartão logo abaixo do saldo), no Novo lançamento (botão +) e na página Assistente, o app manda texto,
  áudio (gravado no navegador) ou a foto do comprovante (reduzida para JPEG de até 1600 px no aparelho) para
  `POST …/whatsapp?app=1` com o login. Liga/desliga em Ajustes → Recursos do app (`features.assist`).
- Tirar foto: no celular, o campo `#photo-cam` (`capture="environment"`) abre a câmera do aparelho; no computador,
  a webcam abre numa folha do app (`getUserMedia`) e desliga ao fotografar ou fechar. O arquivo sai do campo na
  hora e o canvas é zerado: a foto não fica no aparelho, nem no servidor (só passa pela IA).
- Tipo automático (`guessType` no `app.html`, copiado para o robô em `smart.ts`): palavras da frase ("recebi",
  "paguei", "investi", "no cartão", "3x") > aba tocada no formulário (`hint.sure`) > pistas da pessoa (lançamentos
  com as mesmas palavras, nomes das categorias e contas fixas, ícone) > aba lembrada > saída. Cartão quando a
  frase ou a tela dizem, ou quando a pessoa costuma pagar aquilo no cartão (e não disse "pix"/"dinheiro").
  O app manda a aba como `hint: { type, sure, pay, card }`; a função ignora qualquer coisa fora desse formato.
- Foto: a IA devolve o tipo (`saida`, `entrada`, `investimento`) com as categorias de gasto e de entrada da pessoa
  e o nome dela; legenda e aba tocada mandam mais; PIX sem o nome da pessoa segue o histórico de quem paga a ela.
- A função confere o login (`auth.getUser`), limita 20 pedidos por minuto por pessoa, aceita só imagem
  JPEG/PNG/WebP até 3 MB e áudio webm/ogg/mp4/mpeg/wav até 4 MB, e roda o mesmo `serve()` do robô do WhatsApp
  (mesmas regras de lançamento, conta fixa, consultas e limite diário de IA). Devolve a resposta e o lançamento
  criado; o app mostra na hora com Desfazer (que apaga pelo próprio app, com RLS).
- Na página Assistente, pergunta livre vai ao Conselheiro (função `ai`, com o histórico da conversa).
- Áudio: o app converte a gravação para WAV 16 kHz mono (sem o silêncio das pontas, volume ajustado; `toWav` no
  `app.html`) antes de mandar — o WebM do Chrome do celular era recusado pela Groq com 413 de vez em quando. Na
  função: `whisper-large-v3` (reserva `whisper-large-v3-turbo`), `verbose_json` para descartar trechos de silêncio e
  frases inventadas, e o vocabulário da pessoa no `prompt` (`vocabOf`: nomes mais lançados, cartões, categorias
  criadas por ela; até ~440 caracteres, a Groq aceita 224 tokens). Foto: modelo de visão da Groq (`qwen/qwen3.8-27b`).
  Nada é guardado além do lançamento.
- Entender a frase (`whatsapp/understand.ts`): áudio e frase com dúvida (cartão, parcela, fatura, pessoa da família,
  mais de um valor, sem categoria conhecida) vão à IA (`openai/gpt-oss-120b`, reserva `gpt-oss-20b`, esforço baixo,
  saída estrita `json_schema`) com o contexto da pessoa: categorias com exemplos dela, cartões, contas fixas do mês,
  lançamentos parecidos e a aba tocada. A resposta (lançar 1 a 5, faltou o valor, consulta, desfazer, fatura) é
  conferida (`toPlan`) antes de gravar. Frase simples e clara vai pelo lançamento rápido, sem IA. Faltou o valor: a
  função devolve `pending` e o app manda a frase de volta em `context` junto da resposta seguinte.
- Limites da Groq no plano grátis (a chave atual): 8 mil tokens por minuto e 200 mil por dia em cada modelo de
  texto; cada frase entendida usa ~1,8 mil. Para vender com muitos clientes, passar a chave para o plano pago
  (Developer) da Groq. Avaliação com o modelo de verdade: 38 frases reais (as do dono) acertadas com esforço baixo
  em 22/10/2026.

## Publicar o app

1. Mudou o `app.html` → subir `MC_CONFIG.version` e o `VERSION` do `sw.js` juntos (os aparelhos com o app instalado só atualizam assim).
   Mudou algum `<script>` do `app.html` ou do `index.html` → `node csp.js` (a CSP leva o hash de cada script; o `check.js` acusa se esquecer).
2. `npm test && npm run test:browser && npm run shots` e olhar os prints.
3. Commit no `main`: o GitHub Pages publica em cerca de 1 minuto.
4. Conferir no site (versão nova no `app.html` e no `sw.js`), nos logs e nos Advisors do Supabase.

## Regras que não mudam

- No código só a URL e a chave **publicável** do Supabase. Nunca chave secreta (`sb_secret_…`, `service_role`, chave da Groq).
- A Groq só é chamada pela função "ai" (login conferido, limite diário em `ai_consume`, chave em Secrets).
- Plano e validade só mudam no servidor. Toda tabela com RLS.
- Nunca perder dado do usuário: apagar categoria, cartão ou conta fixa não apaga lançamento (testado no `test:db`).

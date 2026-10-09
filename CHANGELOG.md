# Histórico de versões

## 2.2.0 — 09/10/2026
- Robô do WhatsApp: lançar mandando mensagem ou áudio ("mercado 52,90", "recebi 300 pix", "notebook 3.600 12x",
  "uber 23 ontem"), marcar conta fixa ("paguei aluguel"), desfazer, consultar saldo, fatura, contas e metas, e
  perguntar qualquer coisa à IA. Conecta em Ajustes → WhatsApp com um código; dá para desligar em Ajustes.
  Um número conectado só passa para outra conta depois de desconectado; "desfazer" vale até 30 minutos.
- Lançamento rápido entende pontuação ("uber 23 ontem.", "uber, ontem, 23") também no app.
- Botões que abrem links não aparecem mais sublinhados.
- IA preparada para a chave nova do Supabase (a chave antiga deixa de funcionar no fim de 2026).

## 2.1.1 — 09/10/2026
- Backup corrigido: restaurar na mesma conta não duplica lançamentos; restaurar numa conta nova traz
  tudo — lançamentos, cartões (cada compra no cartão certo), contas fixas, metas, categorias com ícone
  e as marcações de "pago". Backup da versão antiga (1.x) continua aceito.
- `novo.html` (endereço usado na troca de versão) agora leva direto ao app.
- Testes, banco (schema e migrações) e a função da IA guardados no repositório em `dev/`.
- Banco otimizado: índices nas chaves estrangeiras, regras de acesso calculadas uma vez por consulta
  e só as permissões que o app usa. Nenhum dado alterado.

## 2.1 — 08/10/2026
- App instalável (celular e PC), abre sem internet com os últimos dados e tem atalho "Novo lançamento".
- Contas fixas a pagar e a receber: situação do mês (pago, atrasado, a vencer), cobrança pelo WhatsApp
  com PIX, botão "Recebi"/"Paguei" que já preenche o lançamento e lançamento automático opcional.
- Metas: limite de gasto por categoria, meta de faturamento e objetivo de guardar.
- Contas fixas e Metas podem ser ligadas ou desligadas em Ajustes, sem apagar dados.
- A IA passou a considerar contas fixas e metas.

## 2.0 — 08/10/2026
- Saída do Firebase para o Supabase (São Paulo): login com e-mail e senha, cada pessoa só acessa os
  próprios dados (regra no banco), 15 dias grátis definidos no servidor. Dados da versão antiga migrados.
- Interface nova: temas Escuro, Claro e Cyber; barra inferior com botão central no celular e menu lateral no PC.
- Ícone automático pelo nome (farmácia → pílula) e escolha livre de ícone ou emoji.
- Lançamento rápido por texto ("notebook 3.600 12x"), cartão com faturas e parcelas, investimentos,
  relatórios com gráficos e PDF.
- Conselheiro com IA rodando numa função do Supabase, com limite diário.

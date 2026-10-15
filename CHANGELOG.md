# Histórico de versões

## 2.3.1 — 15/10/2026
- Senha nova (cadastro e troca) com pelo menos 8 caracteres, letras e números, com a regra à vista.
- Segurança: política de conteúdo (CSP) com o hash de cada script no app e na página inicial; o app no ar
  não abre dentro de moldura de outro site.
- Funções publicadas com entrada mínima (o código vem do commit do GitHub), sem cópia manual de código.

## 2.3.0 — 15/10/2026
- Assistente no app: no Novo lançamento (botão +) você fala 🎤, escreve ou manda a foto/print do comprovante 📷
  e ele lança na hora ("mercado 52,90", "recebi 300 pix", "notebook 3.600 12x", "paguei aluguel"), com
  Desfazer. É o mesmo "cérebro" do robô do WhatsApp, pela função do servidor e com o login da pessoa.
- Comprovante por foto: cupom, nota, PIX, TED ou via da maquininha viram saída com valor, data, loja e a
  categoria certa (no crédito, vai para o cartão com as parcelas). A foto só é lida pela IA: não fica guardada.
- O Conselheiro IA virou Assistente: na mesma conversa lança, responde saldo, fatura e contas (como o robô) e
  responde perguntas livres com o histórico, por texto, voz ou foto.
- Robô do WhatsApp: o cliente só vê "Conectar meu WhatsApp" quando o robô está de fato recebendo mensagens;
  o número de atendimento do dono nunca é usado pelo robô; o dono vê os números da conta com o estado de
  cada um e ativa um número novo com PIN no próprio app, com os caminhos da tela atual da Meta.
- IA: modelo reserva trocado (o antigo saiu do ar na Groq) e leitura de imagem com o modelo de visão atual.
- Novo lançamento no celular abre sem o teclado: o cursor fica piscando no R$ e o teclado só aparece quando
  você toca no valor. No PC continua com o foco no valor.
- Menu lateral do PC encolhe para uma coluna de ícones (com o nome ao passar o mouse) e volta ao normal no
  mesmo botão; a escolha fica salva. Em telas de PC estreitas já começa encolhido.
- Ícones dentro dos quadros 25% maiores e textos maiores em listas, painéis, menu e barra do celular.
- Tema Automático: escuro ou claro, igual ao celular ou computador.
- "Deixe o caixa no automático" virou um guia com progresso: conectar o WhatsApp, contas fixas, conta
  automática, cartão, meta, chave PIX e instalar o app; some quando tudo estiver pronto (ou em Ocultar).
- Resumo do mês refeito: resultado do mês e até 4 pontos com ícone, em ordem de importância (atrasos e
  limites primeiro). Comparação justa com o mês anterior: até o mesmo dia, e não contra o mês inteiro.
  Novo: quanto dá para gastar por dia sem fechar o mês no vermelho; meses por extenso.
- Relatórios: setas de comparação em cada número, saldo como linha de total, gráfico com a linha do saldo,
  tabela dos meses (toque para abrir o mês) com a média dos meses fechados, sem meses vazios antes de começar.
- Contas fixas: quanto já foi pago e recebido no mês. Metas: quanto dá por dia até o fim do mês.
- Cartão no saldo: explicação com exemplo; conta fixa no cartão entra certo no modo "pela data da compra".
- Página inicial nova no mesmo endereço, com a cara do app. Quem já tem conta no aparelho (ou abre o app
  instalado) vai direto para o app; "Começar grátis" abre o cadastro.
- Robô do WhatsApp: descobre sozinho o número da conta (não depende mais do WHATSAPP_PHONE_ID certo) e o
  aviso do dono diz exatamente o que corrigir, com links diretos.
- "Deixe o caixa no automático" só sugere o WhatsApp quando o robô está pronto para os clientes.

## 2.2.1 — 09/10/2026
- Robô do WhatsApp se ativa sozinho na Meta: quando o dono abre Ajustes, o app pede à função para cadastrar o
  webhook e ligar a conta do WhatsApp ao app, e mostra o resultado (ou o que falta, em português claro).
  Clientes não veem esse aviso.
- Toda chamada do robô à Meta leva a prova da chave secreta do app (token vazado sozinho não serve).
- Correção: abrir o app direto em Ajustes não dispara mais a conferência antes do login carregar.

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

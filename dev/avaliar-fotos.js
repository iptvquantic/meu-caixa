// Fotos de comprovante de exemplo para a avaliação da leitura por foto com o modelo de verdade (avaliar-ia.ts, casos
// 101+). Lojas e números fictícios. Gera dev/avaliar/*.jpg no Chromium (uma "foto" de cupom com o nome da loja no topo
// e uma via de maquininha só com os valores). Uso: node avaliar-fotos.js
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const base = `body{margin:0;background:#d9d4c7;display:flex;justify-content:center;padding:18px}
  .p{width:300px;background:#fbfaf6;padding:18px 16px 26px;font:13px/1.35 'DejaVu Sans Mono',monospace;color:#222;box-shadow:0 2px 8px rgba(0,0,0,.25);transform:rotate(-1.2deg)}
  .c{text-align:center}.b{font-weight:700}.r{display:flex;justify-content:space-between}hr{border:0;border-top:1px dashed #555;margin:8px 0}
  .t{font-size:16px}`;
const FOTOS = {
  'cupom-loja.jpg': `<div class="p"><div class="c b t">SUPERMERCADO EXEMPLAR LTDA</div>
    <div class="c">CNPJ 00.000.000/0001-91</div><div class="c">RUA DAS FLORES, 100 - CENTRO</div><div class="c">CAMPOS DOS GOYTACAZES - RJ</div><hr>
    <div class="c b">DOCUMENTO AUXILIAR DA NOTA FISCAL<br>DE CONSUMIDOR ELETRÔNICA</div><hr>
    <div class="r"><span>ARROZ TIPO 1 5KG</span><span>29,90</span></div><div class="r"><span>FEIJAO PRETO 1KG</span><span>8,49</span></div>
    <div class="r"><span>CARNE MOIDA 1KG</span><span>42,90</span></div><div class="r"><span>LEITE INTEGRAL 12UN</span><span>71,88</span></div>
    <div class="r"><span>CAFE TORRADO 500G</span><span>24,90</span></div><div class="r"><span>DETERGENTE 6UN</span><span>17,94</span></div>
    <div class="r"><span>FRANGO CONGELADO</span><span>54,30</span></div><div class="r"><span>OUTROS ITENS (14)</span><span>114,92</span></div><hr>
    <div class="r b"><span>QTD. TOTAL DE ITENS</span><span>21</span></div><div class="r b t"><span>VALOR TOTAL R$</span><span>365,23</span></div>
    <div class="r"><span>FORMA DE PAGAMENTO</span><span>VALOR PAGO</span></div><div class="r"><span>CARTAO DE CREDITO</span><span>365,23</span></div><hr>
    <div class="c">EMISSAO: 06/11/2026 19:51:08</div><div class="c">TRIB. APROX. R$ 98,61</div></div>`,
  'maquininha.jpg': `<div class="p" style="width:250px"><div class="c b t">CIELO</div><div class="c">VIA CLIENTE</div><hr>
    <div>MASTERCARD</div><div>CREDITO A VISTA</div><div>************4321</div><hr>
    <div class="r b t"><span>VALOR</span><span>R$ 11,40</span></div><hr>
    <div>06/11/26 &nbsp; 11:52</div><div>AUT: 123456 &nbsp; DOC: 654321</div><div class="c" style="margin-top:8px">TRANSACAO AUTORIZADA</div></div>`,
};

(async () => {
  const dir = path.join(__dirname, 'avaliar');
  fs.mkdirSync(dir, { recursive: true });
  const br = await chromium.launch();
  const page = await br.newPage({ viewport: { width: 380, height: 640 }, deviceScaleFactor: 1.5 });
  for (const [name, html] of Object.entries(FOTOS)) {
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>${base}</style>${html}`);
    const el = await page.$('body');
    await el.screenshot({ path: path.join(dir, name), type: 'jpeg', quality: 82 });
    console.log(`✅ dev/avaliar/${name}: ${(fs.statSync(path.join(dir, name)).size / 1024).toFixed(0)} KB`);
  }
  await br.close();
})().catch((e) => { console.error(e); process.exit(1); });

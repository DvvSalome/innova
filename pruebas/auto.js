// Abre el panel como cada rol, navega a la vista que importa y captura.
import { chromium } from 'playwright';
const B = 'http://localhost:4180/panel?rol=';
const PASOS = [
  { rol:'admin',        vista:'participantes', ficha:true,  out:'02-admin-ficha.png',        alto:2400 },
  { rol:'admin',        vista:'equipo',        ficha:false, out:'03-admin-equipo.png',       alto:1200 },
  { rol:'admin',        vista:'configuracion', ficha:false, out:'04-admin-pesos.png',        alto:1000 },
  { rol:'jurado1',      vista:'calificar',     ficha:false, out:'05-jurado1-calificar.png',  alto:1100 },
  { rol:'jurado1',      vista:'participantes', ficha:true,  out:'06-jurado1-ficha.png',      alto:2400 },
  { rol:'jurado2',      vista:'participantes', ficha:true,  out:'07-jurado2-ficha.png',      alto:2400 },
  { rol:'editor',       vista:'momentos',      ficha:false, out:'08-editor.png',             alto:1100 },
  { rol:'beneficiario', vista:'inicio',        ficha:false, out:'09-beneficiario.png',       alto:900  },
];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome-stable' });
for (const p of PASOS) {
  const page = await browser.newPage({ viewport:{ width:1440, height:p.alto } });
  const errores = [];
  page.on('pageerror', e => errores.push(String(e).slice(0,120)));
  await page.goto(B + p.rol, { waitUntil:'networkidle' });
  await page.waitForTimeout(1800);
  const nav = await page.$(`.navlink[data-view="${p.vista}"]`);
  let navOk = false;
  if (nav && await nav.isVisible()) { await nav.click().catch(()=>{}); await page.waitForTimeout(1500); navOk = true; }
  if (p.ficha) {
    const b = await page.$('#tblParticipantes button, #tblParticipantes a');
    if (b && await b.isVisible()) { await b.click().catch(()=>{}); await page.waitForTimeout(1200); }
  }
  await page.screenshot({ path:'capturas/'+p.out, fullPage:false });
  const visible = await page.evaluate(() => ({
    rol: document.getElementById('rolTag')?.innerText.replace(/\s+/g,' ').trim(),
    menu: [...document.querySelectorAll('.navlink[data-view]')].filter(n=>n.offsetParent).map(n=>n.textContent.trim().split('\n')[0]),
    login: !!document.querySelector('#loginWrap')?.offsetParent,
  }));
  console.log(`${p.out.padEnd(30)} rol=${(visible.rol||'(login)').padEnd(34)} navOk=${navOk?'si':'NO '} menu=${String(visible.menu.length).padEnd(3)} errores=${errores.length}${errores.length?' -> '+errores[0]:''}`);
  console.log(`${' '.repeat(30)} menu: ${visible.menu.join(', ')}`);
  await page.close();
}
await browser.close();

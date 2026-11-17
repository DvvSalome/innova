// Auditoría del formulario de postulación con capturas: estructura por secciones, «¿Estás
// vendiendo?» condicional, una postulación por cédula, seguridad (archivos, XSS, doble clic),
// ficha del panel y vista de celular. Usa el backend simulado (sw-simulado.js): no toca producción.
//
// Correr (desde la raíz del repo, con POSTULACIONES_ABIERTAS = true en postular.html):
//   npx serve -l 4180            # en otra terminal
//   cd pruebas && node formulario.js
// Variables opcionales: CHROMIUM (ruta del navegador), CAPTURAS (carpeta de salida).
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const SUPABASE_UMD = require.resolve('@supabase/supabase-js/dist/umd/supabase.js');
const CAP = process.env.CAPTURAS || new URL('../docs/revision-ajustes-5.0/capturas', import.meta.url).pathname;
const BASE = 'http://localhost:4180';
mkdirSync(CAP, { recursive: true });

// Archivos de prueba: un PDF válido, uno de 10,5 MB y un ejecutable.
const F = path.join(tmpdir(), 'innova-formulario'); mkdirSync(F, { recursive: true });
writeFileSync(path.join(F, 'doc.pdf'), '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
writeFileSync(path.join(F, 'grande.pdf'), Buffer.alloc(11000000));
writeFileSync(path.join(F, 'virus.exe'), Buffer.from([0x4d, 0x5a, 0x90, 0x00]));
const XSS = '<img src=x onerror="window.__xss=1">';
const txt = (n, pre = '') => (pre + 'Texto de prueba para el formulario de postulación. ').repeat(Math.ceil(n / 50)).slice(0, n);
const res = [];
const ok = (grupo, n, c, d = '') => res.push({ grupo, n, ok: !!c, d: String(d || '') });

await (async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const nuevo = async (viewport = { width: 1280, height: 900 }) => {
    const ctx = await b.newContext({ viewport });
    await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ path: SUPABASE_UMD, contentType: 'application/javascript' }));
    const p = await ctx.newPage(); p.errs = []; p.dialogs = [];
    p.on('pageerror', e => p.errs.push(e.message)); p.on('dialog', d => { p.dialogs.push(d.message()); d.dismiss(); });
    await p.goto(BASE + '/index.html'); await p.evaluate(() => navigator.serviceWorker.register('/sw-simulado.js')); await p.waitForTimeout(1500);
    await p.goto(BASE + '/postular.html'); await p.waitForTimeout(1200);
    // Solo para capturas: sin desplazamiento animado ni cabecera fija que tape el encuadre.
    await ctx.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'html{scroll-behavior:auto!important} nav.top,.progress-wrap{position:static!important}'; document.head.appendChild(st); }));
    await p.reload(); await p.waitForTimeout(1200);
    return { ctx, p };
  };
  const cap = async (p, sel, nombre) => { const el = await p.$(sel); await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(250); await el.screenshot({ path: `${CAP}/${nombre}.png` }); };
  const estado = (p) => p.evaluate(async () => { for (const k of await caches.keys()) { const r = await (await caches.open(k)).match('/__sim/state'); if (r) return await r.json(); } return { postulaciones: [] }; });
  const pick = async (p, id, idx = 1) => { const v = await p.$$eval('#' + id + ' option', o => o.filter(x => x.value).map(x => x.value)); await p.selectOption('#' + id, v[Math.min(idx - 1, v.length - 1)]); await p.waitForTimeout(100); };
  async function llenar(p, { cedula, correo, vende, nombre = 'Prueba Auditoría', emp = 'Emprendimiento Auditoría', pre = '' }) {
    await p.fill('#nombre', nombre); await p.fill('#correo', correo);
    await pick(p, 'tipo_documento'); await p.fill('#cedula', cedula); await p.fill('#whatsapp', '3001234567');
    await pick(p, 'genero'); await p.fill('#nacimiento', '1990-05-10');
    for (const id of ['municipio', 'estrato', 'educacion', 'empleo', 'priorizada']) await pick(p, id);
    await p.selectOption('#discapacidad', 'tiene_discapacidad'); await pick(p, 'tipo_discapacidad');
    await p.fill('#empnombre', emp);
    for (const id of ['tipoemp', 'formalizacion', 'categoria']) await pick(p, id);
    await p.waitForTimeout(250); await pick(p, 'subcategoria'); await pick(p, 'dedicacion'); await p.fill('#colaboradores', '3');
    await pick(p, 'etapa', 2); await pick(p, 'financiacion');
    for (const i of [0, 1]) await p.locator('#odsChips label.chip').nth(i).click();
    await p.fill('#producto', txt(200, pre)); await p.fill('#problema', txt(200, pre)); await p.fill('#impacto', txt(250, pre)); await p.fill('#clientes', txt(150, pre));
    await p.selectOption('#vendiendo', vende ? 'Sí' : 'No');
    if (vende) { await p.fill('#ventas', '2500000'); await pick(p, 'rango_ganancias', 3); }
    await p.fill('#redesList .red-row input', '@minegocio');
    if (vende) await p.setInputFiles('#fSoporte1', F + '/doc.pdf');
    await p.fill('#inversion', txt(200, pre));
    await p.locator('#necesitaChips label.chip').first().click(); await p.locator('#necesitaChips label.chip').nth(1).click();
    for (const id of ['fCedula', 'fRut', 'fRecibo']) await p.setInputFiles('#' + id, F + '/doc.pdf');
    await p.fill('#videoEnlace', 'https://youtube.com/watch?v=abc123');
    await p.fill('#fotosEnlace', 'https://drive.google.com/drive/folders/abc123?usp=sharing');
    await p.check('#terminos'); await p.check('#datos');
  }

  // ===== 1. Estructura del formulario =====
  let { ctx, p } = await nuevo();
  const G1 = '1. Estructura';
  const inSec = (id, sec) => p.$eval('#' + id, (e, s) => !!e.closest('#' + s), sec);
  for (const [id, sec, txtSec] of [['priorizada', 'sec-2', 'Perfil'], ['discapacidad', 'sec-2', 'Perfil'], ['tipoDiscapacidadField', 'sec-2', 'Perfil'], ['etapa', 'sec-3', 'Emprendimiento'], ['financiacion', 'sec-3', 'Emprendimiento'], ['vendiendo', 'sec-4', 'Impacto'], ['ventas', 'sec-4', 'Impacto'], ['rango_ganancias', 'sec-4', 'Impacto'], ['necesitaChips', 'sec-4', 'Impacto']])
    ok(G1, `«${id}» está en ${txtSec}`, await inSec(id, sec));
  ok(G1, 'Ya no existe la sección «Contexto adicional»', (await p.$('#sec-5')) === null && !(await p.content()).includes('Contexto adicional'));
  const orden = await p.evaluate(() => { const g = id => document.getElementById(id); const antes = (a, z) => !!(g(a).compareDocumentPosition(g(z)) & Node.DOCUMENT_POSITION_FOLLOWING); return { v: antes('clientes', 'vendiendo') && antes('vendiendo', 'ventas') && antes('vendiendo', 'rango_ganancias'), n: antes('inversion', 'necesitaChips') }; });
  ok(G1, '«¿Estás vendiendo?» va justo antes de ventas y ganancia', orden.v);
  ok(G1, '«Lo que más necesita» va después de «recursos»', orden.n);
  ok(G1, 'Etiqueta: «Describe el impacto social y ambiental que genera tu emprendimiento»', (await p.$eval('label[for=impacto]', e => e.textContent)).includes('Describe el impacto social y ambiental que genera tu emprendimiento'));
  const pasos = await p.$$eval('#progressSteps a', a => a.map(x => x.textContent.trim()));
  ok(G1, 'Barra de pasos con 5 secciones (01–05)', pasos.join('|') === '01 Tus datos|02 Perfil|03 Emprendimiento|04 Impacto|05 Documentos', pasos.join(' · '));
  const nums = await p.$$eval('.fset .lg .no', a => a.map(x => x.textContent.trim()));
  ok(G1, 'Numeración de secciones consecutiva', nums.join(',') === '01,02,03,04,05', nums.join(','));
  await cap(p, '.progress-wrap', '01-barra-de-pasos');
  await p.selectOption('#discapacidad', 'tiene_discapacidad');
  await cap(p, '#sec-2', '02-perfil');
  await cap(p, '#sec-3', '03-emprendimiento');

  // ===== 2. Condicional de ventas =====
  const G2 = '2. «¿Estás vendiendo?»';
  ok(G2, 'Sin responder: ventas y ganancia ocultas', !(await p.isVisible('#bloqueVentas')));
  await cap(p, '#vendiendo >> xpath=ancestor::div[contains(@class,"field")]', '04-vendiendo-sin-responder');
  await p.selectOption('#vendiendo', 'Sí');
  ok(G2, 'Con «Sí»: aparecen ventas y ganancia', await p.isVisible('#ventas') && await p.isVisible('#rango_ganancias'));
  await p.evaluate(() => document.getElementById('vendiendo').scrollIntoView({ block: 'start' })); await p.waitForTimeout(300);
  await p.screenshot({ path: `${CAP}/05-vendiendo-si.png`, fullPage: true, clip: await p.evaluate(() => { const a = document.getElementById('vendiendo').closest('.field').getBoundingClientRect(); const z = document.getElementById('bloqueVentas').getBoundingClientRect(); return { x: 220, y: a.top + scrollY - 14, width: 840, height: z.bottom - a.top + 28 }; }) });
  await p.selectOption('#vendiendo', 'No');
  ok(G2, 'Con «No»: se ocultan', !(await p.isVisible('#bloqueVentas')));
  await cap(p, '#vendiendo >> xpath=ancestor::div[contains(@class,"field")]', '06-vendiendo-no');
  await p.evaluate(() => document.getElementById('inversion').scrollIntoView({ block: 'start' })); await p.waitForTimeout(300);
  await p.screenshot({ path: `${CAP}/07-recursos-y-necesidades.png`, fullPage: true, clip: await p.evaluate(() => { const a = document.getElementById('inversion').closest('.field').getBoundingClientRect(); const z = document.getElementById('necesitaChips').closest('.field').getBoundingClientRect(); return { x: 220, y: a.top + scrollY - 14, width: 840, height: z.bottom - a.top + 28 }; }) });

  // «Sí» sin ventas no se envía; el aviso lo nombra
  await llenar(p, { cedula: '1111111111', correo: 'si@example.com', vende: true });
  await p.fill('#ventas', ''); await p.click('#submitBtn'); await p.waitForTimeout(800);
  ok(G2, '«Sí» sin promedio de ventas: NO se envía', !(await p.isVisible('#successCard')));
  const pend = await p.$eval('#pendingList', e => e.innerText);
  ok(G2, 'El aviso de pendientes nombra el campo y la sección', /Promedio mensual de ventas · Impacto/.test(pend), pend.replace(/\s+/g, ' '));
  await cap(p, '#pendingBox', '08-aviso-falta-ventas');
  // borrador
  await p.waitForTimeout(700); await p.reload(); await p.waitForTimeout(1200);
  ok(G2, 'El borrador recupera «Sí» y muestra ventas/ganancia', (await p.$eval('#vendiendo', e => e.value)) === 'Sí' && await p.isVisible('#bloqueVentas'));
  ok(G2, 'El borrador recupera discapacidad y su tipo', (await p.$eval('#discapacidad', e => e.value)) === 'tiene_discapacidad' && (await p.$eval('#tipo_discapacidad', e => e.value)) !== '');
  for (const id of ['fCedula', 'fRut', 'fRecibo', 'fSoporte1']) await p.setInputFiles('#' + id, F + '/doc.pdf');
  await p.fill('#ventas', '2500000'); await p.click('#submitBtn'); await p.waitForTimeout(3500);
  ok(G2, '«Sí» completo: se envía', await p.isVisible('#successCard'));
  await cap(p, '#successCard', '09-envio-exitoso');

  // «No»
  await p.evaluate(() => localStorage.clear()); await p.goto(BASE + '/postular.html'); await p.waitForTimeout(1200);
  await llenar(p, { cedula: '2222222222', correo: 'no@example.com', vende: false }); await p.click('#submitBtn'); await p.waitForTimeout(3500);
  ok(G2, '«No» sin ventas ni ganancia: se envía', await p.isVisible('#successCard'));
  let st = await estado(p);
  const si = st.postulaciones.find(x => x.correo === 'si@example.com'), no = st.postulaciones.find(x => x.correo === 'no@example.com');
  ok(G2, '«Sí» guarda las ventas y el rango elegidos', si && Number(si.promedio_ventas_6_meses) === 2500000 && si.rango_ganancias === '$500.000 – $1.000.000' && si.esta_vendiendo === true, si && `${si.promedio_ventas_6_meses} · ${si.rango_ganancias}`);
  ok(G2, '«No» guarda ventas 0 y «Aún no tengo ganancias»', no && Number(no.promedio_ventas_6_meses) === 0 && no.rango_ganancias === 'Aún no tengo ganancias' && no.esta_vendiendo === false, no && `${no.promedio_ventas_6_meses} · ${no.rango_ganancias}`);
  ok(G2, 'Los campos movidos llegan a la base', no && no.poblacion_priorizada && no.discapacidad === 'Sí' && no.tipo_discapacidad && no.etapa_emprendimiento && no.ha_recibido_financiacion !== undefined && (no.necesidades || []).length === 2,
    no && [no.poblacion_priorizada, no.discapacidad, no.tipo_discapacidad, no.etapa_emprendimiento].join(' · '));

  // ===== 3. Una postulación por cédula =====
  const G3 = '3. Una postulación por cédula';
  await p.evaluate(() => localStorage.clear()); await p.goto(BASE + '/postular.html'); await p.waitForTimeout(1200);
  await llenar(p, { cedula: '2222222222', correo: 'repetida@example.com', vende: false }); await p.click('#submitBtn'); await p.waitForTimeout(3500);
  const msg = await p.$eval('#sendError', e => e.classList.contains('on') ? e.innerText : '');
  ok(G3, 'La misma cédula no se guarda dos veces', !(await p.isVisible('#successCard')) && (await estado(p)).postulaciones.filter(x => x.cedula === '2222222222').length === 1);
  ok(G3, 'Mensaje claro: «Ya existe una postulación con ese número de documento»', /Ya existe una postulación con ese número de documento/.test(msg), msg.replace(/\s+/g, ' ').slice(0, 120));
  await cap(p, '#sendError', '10-cedula-repetida');
  ok(G3, 'Sin errores de JavaScript en el formulario', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();

  // ===== 4. Seguridad =====
  const G4 = '4. Seguridad';
  ({ ctx, p } = await nuevo());
  await p.setInputFiles('#fCedula', F + '/grande.pdf'); await p.waitForTimeout(300);
  ok(G4, 'Archivo de 10,5 MB marcado «supera 10 MB»', /supera 10 MB/.test(await p.$eval('#fCedula', e => e.closest('.field').innerText)));
  await p.setInputFiles('#fRut', F + '/virus.exe'); await p.waitForTimeout(300);
  ok(G4, 'Archivo .exe marcado «formato no permitido»', /formato no permitido/.test(await p.$eval('#fRut', e => e.closest('.field').innerText)));
  await cap(p, '#sec-6 .grid2', '11-archivos-invalidos');
  await llenar(p, { cedula: '3333333333', correo: 'xss@example.com', vende: true, nombre: 'Ana ' + XSS, emp: 'Emp ' + XSS, pre: XSS });
  await p.setInputFiles('#fCedula', F + '/grande.pdf'); await p.setInputFiles('#fRut', F + '/virus.exe');
  await p.click('#submitBtn'); await p.waitForTimeout(1500);
  ok(G4, 'Con archivos inválidos NO se envía', !(await p.isVisible('#successCard')) && !(await estado(p)).postulaciones.some(x => x.correo === 'xss@example.com'));
  await p.setInputFiles('#fCedula', F + '/doc.pdf'); await p.setInputFiles('#fRut', F + '/doc.pdf');
  await p.fill('#web', 'javascript:alert(1)'); await p.click('#submitBtn'); await p.waitForTimeout(1200);
  ok(G4, 'Página web «javascript:» rechazada', !(await p.isVisible('#successCard')));
  await p.fill('#web', 'https://ejemplo.com');
  await p.locator('#submitBtn').dblclick({ delay: 10 }); await p.waitForTimeout(4000);
  st = await estado(p);
  ok(G4, 'Doble clic en «Postular» crea una sola postulación', st.postulaciones.filter(x => x.correo === 'xss@example.com').length === 1);
  const a = await ctx.newPage(); a.errs = []; a.on('pageerror', e => a.errs.push(e.message)); a.on('dialog', d => { p.dialogs.push(d.message()); d.dismiss(); });
  await a.goto(BASE + '/admin.html'); await a.waitForTimeout(1500);
  await a.fill('#loginEmail', 'admin@prueba.local'); await a.fill('#loginPassword', 'Prueba-2026!'); await a.click('#loginBtn'); await a.waitForTimeout(2500);
  await a.click('.navlink[data-view="participantes"]'); await a.waitForTimeout(1500);
  await a.locator('tr', { hasText: 'xss@example.com' }).filter({ has: a.locator('[data-ver]') }).first().locator('[data-ver]').click(); await a.waitForTimeout(1200);
  const ficha = await a.$eval('#genBody', e => e.innerHTML);
  ok(G4, 'El panel muestra el código malicioso como texto (escapado)', ficha.length > 0 && !/<img src=x/i.test(ficha) && /&lt;img/.test(ficha));
  ok(G4, 'No se ejecutó ningún script ni alerta', !(await a.evaluate(() => window.__xss)) && !(await p.evaluate(() => window.__xss)) && p.dialogs.length === 0);
  await a.screenshot({ path: `${CAP}/12-panel-ficha-xss-escapado.png` });
  await ctx.close();

  // ===== 5. Panel: ficha con los campos movidos =====
  const G5 = '5. Panel de administración';
  ({ ctx, p } = await nuevo());
  await llenar(p, { cedula: '4444444444', correo: 'ficha@example.com', vende: false, nombre: 'María Ficha', emp: 'Ficha Verde' }); await p.click('#submitBtn'); await p.waitForTimeout(3500);
  const a2 = await ctx.newPage(); a2.errs = []; a2.on('pageerror', e => a2.errs.push(e.message));
  await a2.goto(BASE + '/admin.html'); await a2.waitForTimeout(1500);
  await a2.fill('#loginEmail', 'admin@prueba.local'); await a2.fill('#loginPassword', 'Prueba-2026!'); await a2.click('#loginBtn'); await a2.waitForTimeout(2500);
  await a2.click('.navlink[data-view="participantes"]'); await a2.waitForTimeout(1500);
  await a2.locator('tr', { hasText: 'ficha@example.com' }).filter({ has: a2.locator('[data-ver]') }).first().locator('[data-ver]').click(); await a2.waitForTimeout(1200);
  const f2 = await a2.$eval('#genBody', e => e.textContent); // textContent: el CSS pone las etiquetas en mayúsculas
  for (const etq of ['Población priorizada', 'Etapa', '¿Está vendiendo?', 'Ventas (promedio mensual)', 'Ganancia mensual'])
    ok(G5, `La ficha muestra «${etq}»`, f2.includes(etq));
  ok(G5, 'La ficha muestra «Aún no tengo ganancias» para quien no vende', f2.includes('Aún no tengo ganancias'));
  ok(G5, 'Sin errores de JavaScript en el panel', a2.errs.length === 0, a2.errs.join(' | '));
  await a2.screenshot({ path: `${CAP}/13-panel-ficha.png` });
  await a2.evaluate(() => { const k = [...document.querySelectorAll('#genBody .k')].find(x => x.textContent.trim() === 'Etapa'); if (k) k.scrollIntoView({ block: 'start' }); }); await a2.waitForTimeout(300);
  await a2.screenshot({ path: `${CAP}/13b-panel-ficha-ventas.png` });
  await ctx.close();

  // ===== 7. Ajustes del bloque 2 =====
  const G7 = '6. Textos y reglas nuevas';
  ({ ctx, p } = await nuevo());
  // nube de tipología
  ok(G7, 'La nube de tipología empieza cerrada', !(await p.isVisible('#nubeTipo')) && (await p.getAttribute('#nubeBtn', 'aria-expanded')) === 'false');
  await p.click('#nubeBtn');
  const nubeTxt = await p.$eval('#nubeTipo', e => e.innerText);
  ok(G7, 'Al pulsar «¿Cuál es la diferencia?» se abre y explica las dos tipologías', await p.isVisible('#nubeTipo') && /Emprendimiento verde/.test(nubeTxt) && /Negocio verde/.test(nubeTxt) && (await p.getAttribute('#nubeBtn', 'aria-expanded')) === 'true');
  await cap(p, '#tipoemp >> xpath=ancestor::div[contains(@class,"field")]', '16-nube-tipologia');
  await p.keyboard.press('Escape');
  ok(G7, 'Escape cierra la nube', !(await p.isVisible('#nubeTipo')));
  await p.click('#nubeBtn'); await p.click('#empnombre');
  ok(G7, 'Pulsar fuera cierra la nube', !(await p.isVisible('#nubeTipo')));
  ok(G7, 'La nube no empuja a «Tipo de emprendimiento» fuera del formulario (sigue el select)', await p.isVisible('#tipoemp'));
  // notas de ventas y ganancia
  await p.selectOption('#vendiendo', 'Sí');
  const notaV = await p.$eval('#ventas', e => e.closest('.field').innerText), notaG = await p.$eval('#rango_ganancias', e => e.closest('.field').innerText);
  ok(G7, 'Ventas tiene la nota de «lo que facturas»', /Lo que facturas/.test(notaV) && /antes de restar costos y gastos/.test(notaV));
  ok(G7, 'Ganancia tiene la nota de «lo que te queda» con un ejemplo', /Lo que te queda/.test(notaG) && /\$500\.000/.test(notaG));
  await p.evaluate(() => document.getElementById('vendiendo').scrollIntoView({ block: 'start' })); await p.waitForTimeout(300);
  await p.screenshot({ path: `${CAP}/17-notas-ventas-ganancia.png`, fullPage: true, clip: await p.evaluate(() => { const a = document.getElementById('bloqueVentas').getBoundingClientRect(); return { x: 220, y: a.top + scrollY - 14, width: 840, height: a.height + 28 }; }) });
  // redes obligatorias
  const etqRedes = await p.$eval('#redesList', e => e.closest('.field').querySelector('label').innerText);
  ok(G7, 'Redes sociales ya no dice «opcional» y pide al menos una', !/opcional/i.test(etqRedes) && /\*/.test(etqRedes) && /al menos una/.test(etqRedes), etqRedes.replace(/\s+/g, ' '));
  await llenar(p, { cedula: '5555555555', correo: 'redes@example.com', vende: false });
  await p.fill('#redesList .red-row input', ''); await p.click('#submitBtn'); await p.waitForTimeout(800);
  ok(G7, 'Sin ninguna red social NO se envía', !(await p.isVisible('#successCard')));
  const errRedes = await p.$eval('#redesErr', e => ({ visible: getComputedStyle(e).display !== 'none', txt: e.innerText }));
  ok(G7, 'El aviso pide agregar al menos una red', errRedes.visible && /al menos una red/.test(errRedes.txt), errRedes.txt);
  ok(G7, 'El resumen de pendientes nombra «Redes sociales»', /Redes sociales/.test(await p.$eval('#pendingList', e => e.innerText)));
  await cap(p, '#redesList >> xpath=ancestor::div[contains(@class,"field")]', '18-redes-obligatorias');
  await p.fill('#redesList .red-row input', '%%%'); await p.click('#submitBtn'); await p.waitForTimeout(600);
  ok(G7, 'Una red con formato inválido tampoco deja enviar', !(await p.isVisible('#successCard')));
  await p.fill('#redesList .red-row input', '@minegocio'); await p.click('#submitBtn'); await p.waitForTimeout(3500);
  ok(G7, 'Con una red válida el envío pasa', await p.isVisible('#successCard'));
  const rd = (await estado(p)).postulaciones.find(x => x.correo === 'redes@example.com');
  ok(G7, 'La red se guarda como enlace', rd && /instagram\.com\/minegocio/i.test(JSON.stringify(rd.redes || rd.redes_sociales)), rd && JSON.stringify(rd.redes));
  await ctx.close();
  ({ ctx, p } = await nuevo());
  const vid = await p.$eval('#videoEnlace', e => e.closest('.field').innerText);
  ok(G7, 'Video: «Máximo 3 minutos» con las tres cosas que debe contar', /Máximo 3 minutos/.test(vid) && /existe/.test(vid) && /propuesta de valor/.test(vid) && /por qué deberías ser elegido/.test(vid) && !/90 segundos/.test(vid));
  await cap(p, '#videoEnlace >> xpath=ancestor::div[contains(@class,"field")]', '19-video-3-minutos');
  ok(G7, 'Sin errores de JavaScript en el formulario', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
  // inicio y convocatoria
  ({ ctx, p } = await nuevo());
  await p.goto(BASE + '/index.html'); await p.waitForTimeout(1500);
  const hero = await p.$eval('.hero-stats', e => e.innerText);
  ok(G7, 'Inicio: la cifra destacada es $12M', /\$12M/.test(hero) && !/\$10M/.test(hero), hero.replace(/\s+/g, ' '));
  const cuerpo = await p.evaluate(() => document.body.innerText);
  ok(G7, 'Inicio: «hasta $12.000.000 en especie» y ningún $10.000.000', /hasta \$12\.000\.000 en especie/.test(cuerpo) && !/\$10\.000\.000/.test(cuerpo));
  ok(G7, 'Inicio: el requisito de video dice 3 minutos', /máximo 3 minutos/.test(cuerpo) && !/90 segundos/.test(cuerpo));
  const hv = await p.$eval('.hero-stats', e => { const r = e.getBoundingClientRect(); return { y: r.top + scrollY, h: r.height }; });
  await p.screenshot({ path: `${CAP}/20-inicio-12-millones.png`, fullPage: true, clip: { x: 0, y: Math.max(0, hv.y - 24), width: 1280, height: hv.h + 48 } });
  const enlace = await p.$eval('#mas-info a.ml-2', a => ({ href: a.getAttribute('href'), txt: a.innerText.trim() }));
  ok(G7, '«Ruta del programa» ya no abre ruta.html: lleva a convocatoria.html#etapas', enlace.href === 'convocatoria.html#etapas' && /Ruta del programa/.test(enlace.txt), JSON.stringify(enlace));
  await p.click('#mas-info a.ml-2'); await p.waitForURL(/convocatoria\.html#etapas/); await p.waitForTimeout(1800);
  const pos = await p.evaluate(() => { const e = document.getElementById('etapas'); if (!e) return null; const r = e.getBoundingClientRect(); return { arriba: Math.round(r.top), alto: window.innerHeight, h2: e.querySelector('h2').innerText }; });
  ok(G7, 'Al abrirlo, la página queda en la sección «Etapas»', pos && pos.h2 === 'Etapas' && pos.arriba >= 0 && pos.arriba < pos.alto * 0.5, JSON.stringify(pos));
  await p.screenshot({ path: `${CAP}/21-convocatoria-etapas.png` });
  const conv = await p.evaluate(() => document.body.innerText);
  ok(G7, 'Convocatoria: el requisito de video dice 3 minutos', /máximo 3 minutos/.test(conv) && !/90 segundos/.test(conv));
  await ctx.close();

  // ===== 8. Documentos soporte de ventas y fotos =====
  const G8 = '7. Soporte de ventas y fotos';
  ({ ctx, p } = await nuevo());
  ok(G8, 'El soporte de ventas empieza oculto', !(await p.isVisible('#bloqueSoporte')));
  await p.selectOption('#vendiendo', 'Sí');
  ok(G8, 'Con «Sí» aparecen 4 espacios para documentos', await p.isVisible('#bloqueSoporte') && (await p.$$('#bloqueSoporte input[type=file]')).length === 4);
  const txtSop = await p.$eval('#bloqueSoporte', e => e.innerText);
  ok(G8, 'Explica los tipos válidos: factura electrónica, cuenta de cobro, certificación comercial y contrato', /factura electrónica/.test(txtSop) && /cuenta de cobro/.test(txtSop) && /certificación comercial/.test(txtSop) && /contrato/.test(txtSop));
  ok(G8, 'Solo el primero es obligatorio; los otros dicen «opcional»', /Documento 1 \*/.test(txtSop) && (txtSop.match(/opcional/g) || []).length === 3);
  await p.selectOption('#vendiendo', 'No');
  ok(G8, 'Con «No» el bloque desaparece', !(await p.isVisible('#bloqueSoporte')));
  await p.selectOption('#vendiendo', 'Sí');
  await cap(p, '#bloqueSoporte', '22-soporte-de-ventas');
  // «Sí» sin ningún soporte
  await llenar(p, { cedula: '6666666666', correo: 'soporte@example.com', vende: true });
  await p.evaluate(() => { const i = document.getElementById('fSoporte1'); i.value = ''; i.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.click('#submitBtn'); await p.waitForTimeout(800);
  ok(G8, '«Sí» sin ningún documento soporte: NO se envía', !(await p.isVisible('#successCard')));
  const pendS = await p.$eval('#pendingList', e => e.innerText);
  ok(G8, 'El aviso nombra «Documento soporte de ventas 1»', /Documento soporte de ventas 1/.test(pendS), pendS.replace(/\s+/g, ' ').slice(0, 90));
  await cap(p, '#bloqueSoporte', '23-soporte-obligatorio');
  // soporte inválido en el espacio 2
  await p.setInputFiles('#fSoporte1', F + '/doc.pdf'); await p.setInputFiles('#fSoporte2', F + '/virus.exe');
  await p.click('#submitBtn'); await p.waitForTimeout(700);
  ok(G8, 'Un soporte .exe en el espacio 2 NO deja enviar', !(await p.isVisible('#successCard')));
  await p.setInputFiles('#fSoporte2', F + '/grande.pdf');
  await p.click('#submitBtn'); await p.waitForTimeout(700);
  ok(G8, 'Un soporte de 10,5 MB NO deja enviar', !(await p.isVisible('#successCard')));
  // fotos
  await p.setInputFiles('#fSoporte2', []);
  for (const [v, nombre] of [['', 'vacío'], ['javascript:alert(1)', '«javascript:»'], ['https://ejemplo.com/fotos', 'en un sitio que no es una nube de archivos']]) {
    await p.fill('#fotosEnlace', v); await p.click('#submitBtn'); await p.waitForTimeout(600);
    ok(G8, `Fotos ${nombre}: NO se envía`, !(await p.isVisible('#successCard')));
  }
  await p.fill('#fotosEnlace', ''); await p.click('#submitBtn'); await p.waitForTimeout(500);
  const errFotos = await p.$eval('#fotosEnlace', e => e.closest('.field').querySelector('.err').innerText);
  ok(G8, 'Sin enlace de fotos el aviso lo pide', /Pega el enlace de la carpeta de Drive/.test(errFotos), errFotos);
  await cap(p, '#fotosEnlace >> xpath=ancestor::div[contains(@class,"field")]', '24-fotos-drive');
  await p.fill('#fotosEnlace', 'https://drive.google.com/drive/folders/abc123?usp=sharing');
  // envío con 3 soportes
  await p.setInputFiles('#fSoporte2', F + '/doc.pdf'); await p.setInputFiles('#fSoporte3', F + '/doc.pdf');
  await p.click('#submitBtn'); await p.waitForTimeout(4500);
  ok(G8, '«Sí» con 3 documentos soporte y fotos: se envía', await p.isVisible('#successCard'));
  let st8 = await estado(p);
  const sp = st8.postulaciones.find(x => x.correo === 'soporte@example.com');
  const claves = sp ? Object.keys(typeof sp.documentos === 'string' ? JSON.parse(sp.documentos) : sp.documentos).sort() : [];
  ok(G8, 'Guarda cedula, rut, recibo y soporte_ventas_1 a 3', claves.join(',') === 'cedula,recibo_triple_a,rut,soporte_ventas_1,soporte_ventas_2,soporte_ventas_3', claves.join(','));
  ok(G8, 'Sube 6 archivos a la carpeta de esa postulación', sp && st8.storage.filter(x => x.bucket === 'postulaciones' && x.name.startsWith(sp.id + '/')).length === 6, sp && String(st8.storage.filter(x => x.name.startsWith(sp.id + '/')).length));
  ok(G8, 'Guarda el enlace de fotos de Drive', sp && sp.fotos_enlace === 'https://drive.google.com/drive/folders/abc123?usp=sharing', sp && sp.fotos_enlace);
  // Panel con la postulación que sí vende: ficha y CSV
  const a8 = await ctx.newPage(); a8.errs = []; a8.on('pageerror', e => a8.errs.push(e.message));
  const entrarPanel = async () => { await a8.goto(BASE + '/admin.html'); await a8.waitForTimeout(1500);
    if (await a8.isVisible('#loginEmail')) { await a8.fill('#loginEmail', 'admin@prueba.local'); await a8.fill('#loginPassword', 'Prueba-2026!'); await a8.click('#loginBtn'); await a8.waitForTimeout(2500); }
    await a8.click('.navlink[data-view="participantes"]'); await a8.waitForTimeout(1500); };
  const abrirFicha = async (mail) => { await a8.locator('tr', { hasText: mail }).filter({ has: a8.locator('[data-ver]') }).first().locator('[data-ver]').click(); await a8.waitForTimeout(1000); return await a8.$eval('#genBody', e => e.textContent); };
  await entrarPanel();
  const fSi = await abrirFicha('soporte@example.com');
  ok(G8, 'Panel: la ficha de quien vende muestra «Soporte de ventas 1», 2 y 3', /Soporte de ventas 1/.test(fSi) && /Soporte de ventas 2/.test(fSi) && /Soporte de ventas 3/.test(fSi) && !/Soporte de ventas 4/.test(fSi));
  ok(G8, 'Panel: muestra el enlace de fotos como vínculo seguro', await a8.$eval('#genBody', e => [...e.querySelectorAll('a')].some(x => x.href.startsWith('https://drive.google.com/') && x.rel.includes('noopener'))));
  await a8.evaluate(() => { const k = [...document.querySelectorAll('#genBody .k')].find(x => /Documentos adjuntos/i.test(x.textContent)); if (k) k.scrollIntoView({ block: 'center' }); }); await a8.waitForTimeout(300);
  await a8.screenshot({ path: `${CAP}/25-panel-soporte-y-fotos.png` });
  await entrarPanel();
  const [dl] = await Promise.all([a8.waitForEvent('download', { timeout: 8000 }).catch(() => null), a8.click('#btnExportar')]);
  let csv = ''; if (dl) { const fs = await import('node:fs'); csv = fs.readFileSync(await dl.path(), 'utf8'); }
  ok(G8, 'CSV: incluye la columna fotos_enlace y su valor', /fotos_enlace/.test(csv.split('\n')[0]) && csv.includes('https://drive.google.com/drive/folders/abc123?usp=sharing'));
  ok(G8, 'CSV: la columna documentos lista los soportes', /soporte_ventas_1: /.test(csv) && /soporte_ventas_3: /.test(csv));
  ok(G8, 'Sin errores de JavaScript en el panel (quien vende)', a8.errs.length === 0, a8.errs.join(' | '));
  await ctx.close();
  // «Sí» elige archivos y luego cambia a «No»: no se suben
  ({ ctx, p } = await nuevo());
  await llenar(p, { cedula: '7777777777', correo: 'cambio@example.com', vende: true });
  await p.setInputFiles('#fSoporte2', F + '/doc.pdf');
  await p.selectOption('#vendiendo', 'No'); await p.click('#submitBtn'); await p.waitForTimeout(4500);
  ok(G8, 'Si cambia a «No» después de elegir archivos, igual se envía', await p.isVisible('#successCard'));
  st8 = await estado(p);
  const cm = st8.postulaciones.find(x => x.correo === 'cambio@example.com');
  ok(G8, '…y los soportes NO se suben ni se guardan', cm && st8.storage.filter(x => x.name.startsWith(cm.id + '/')).length === 3 && !JSON.stringify(cm.documentos).includes('soporte'), cm && String(st8.storage.filter(x => x.name.startsWith(cm.id + '/')).length));
  ok(G8, '…y queda ventas 0 y sin ganancias', cm && Number(cm.promedio_ventas_6_meses) === 0 && cm.rango_ganancias === 'Aún no tengo ganancias');
  // Panel con la postulación que NO vende
  const a9 = await ctx.newPage(); a9.errs = []; a9.on('pageerror', e => a9.errs.push(e.message));
  const entrarPanel9 = async () => { await a9.goto(BASE + '/admin.html'); await a9.waitForTimeout(1500);
    if (await a9.isVisible('#loginEmail')) { await a9.fill('#loginEmail', 'admin@prueba.local'); await a9.fill('#loginPassword', 'Prueba-2026!'); await a9.click('#loginBtn'); await a9.waitForTimeout(2500); }
    await a9.click('.navlink[data-view="participantes"]'); await a9.waitForTimeout(1500); };
  const abrirFicha9 = async (mail) => { await a9.locator('tr', { hasText: mail }).filter({ has: a9.locator('[data-ver]') }).first().locator('[data-ver]').click(); await a9.waitForTimeout(1000); return await a9.$eval('#genBody', e => e.textContent); };
  await entrarPanel9();
  const fNo = await abrirFicha9('cambio@example.com');
  ok(G8, 'Panel: quien no vende no muestra soportes ni «sin adjunto» de soportes', !/Soporte de ventas/.test(fNo));
  ok(G8, 'Sin errores de JavaScript en el panel (quien no vende)', a9.errs.length === 0, a9.errs.join(' | '));
  await ctx.close();

  // ===== 6. Celular =====
  const G6 = '8. Celular (390 px)';
  ({ ctx, p } = await nuevo({ width: 390, height: 844 }));
  const ancho = await p.evaluate(() => document.documentElement.scrollWidth);
  ok(G6, 'Sin desplazamiento horizontal', ancho <= 390, 'ancho=' + ancho);
  await p.selectOption('#vendiendo', 'Sí');
  await p.evaluate(() => document.getElementById('vendiendo').scrollIntoView({ block: 'start' })); await p.waitForTimeout(300);
  await p.screenshot({ path: `${CAP}/14-celular-impacto.png` });
  await p.evaluate(() => window.scrollTo(0, 0)); await p.screenshot({ path: `${CAP}/15-celular-inicio.png` });
  ok(G6, 'Sin errores de JavaScript', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();

  writeFileSync(path.join(CAP, 'resultados.json'), JSON.stringify(res, null, 1));
  let g = '';
  for (const r of res) { if (r.grupo !== g) { g = r.grupo; console.log('\n' + g); } console.log((r.ok ? '  OK    ' : '  FALLA ') + r.n + (r.d ? '  [' + r.d + ']' : '')); }
  console.log('\nTOTAL:', res.filter(r => r.ok).length, '/', res.length);
  await b.close();
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });

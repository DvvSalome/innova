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
    await p.fill('#inversion', txt(200, pre));
    await p.locator('#necesitaChips label.chip').first().click(); await p.locator('#necesitaChips label.chip').nth(1).click();
    for (const id of ['fCedula', 'fRut', 'fRecibo']) await p.setInputFiles('#' + id, F + '/doc.pdf');
    await p.fill('#videoEnlace', 'https://youtube.com/watch?v=abc123'); await p.check('#terminos'); await p.check('#datos');
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
  for (const id of ['fCedula', 'fRut', 'fRecibo']) await p.setInputFiles('#' + id, F + '/doc.pdf');
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

  // ===== 6. Celular =====
  const G6 = '6. Celular (390 px)';
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

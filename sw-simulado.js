// Backend simulado de Supabase para recorrer el sitio en localhost sin tocar producción.
// Intercepta todo lo que va a *.supabase.co: auth, REST (con permisos por rol), storage,
// la función «correos» y analítica. El estado vive en Cache Storage y sobrevive a la navegación.
// Uso: ver pruebas/README-flujo-simulado.md. Nunca se publica (está en .vercelignore).
const PASS = 'Prueba-2026!';
const KEY = '/__sim/state';
const HOST = /\.supabase\.co$/;
const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const J = (b, s = 200, h = {}) => new Response(b === null ? null : JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...h } });

const U = {
  admin: '10000000-0000-4000-8000-000000000001', j1: '10000000-0000-4000-8000-000000000002',
  j2: '10000000-0000-4000-8000-000000000003', editor: '10000000-0000-4000-8000-000000000004',
};

async function seed() {
  const t = new Date();
  const hace = (d) => new Date(t - d * 864e5).toISOString();
  const s = {
    users: [
      { id: U.admin, email: 'admin@prueba.local' }, { id: U.j1, email: 'jurado1@prueba.local' },
      { id: U.j2, email: 'jurado2@prueba.local' }, { id: U.editor, email: 'editor@prueba.local' },
    ],
    profiles: [
      { id: U.admin, email: 'admin@prueba.local', full_name: 'Admin Prueba', role: 'admin', entidad: null, cohorte: null },
      { id: U.j1, email: 'jurado1@prueba.local', full_name: 'Laura Jurado Inngenios', role: 'evaluador', entidad: 'jurado_1', cohorte: null },
      { id: U.j2, email: 'jurado2@prueba.local', full_name: 'Andrés Jurado Triple A', role: 'evaluador', entidad: 'jurado_2', cohorte: null },
      { id: U.editor, email: 'editor@prueba.local', full_name: 'Edna Editora', role: 'editor', entidad: null, cohorte: null },
    ],
    jurados: [{ clave: 'jurado_1', nombre: 'Inngenios', orden: 1, activo: true }, { clave: 'jurado_2', nombre: 'Triple A', orden: 2, activo: true }],
    configuracion: [{ clave: 'pesos', valor: { plataforma: 0.4, jurado_1: 0.3, jurado_2: 0.3 } }],
    postulaciones: [
      { id: uuid(), created_at: hace(3), estado: 'postulado', nombre_completo: 'Marta Ruiz Pérez', correo: 'marta@prueba.local', whatsapp: '+573001112233', cedula: '1045678901', domicilio: 'Cra 10 # 5-20', municipio: 'Soledad', nombre_emprendimiento: 'Huerta Viva', tipo_emprendimiento: 'Negocio verde', tipo_formalizacion: 'Persona natural', dedicacion_tiempo: 'Completo', num_colaboradores: 4, etapa_emprendimiento: 'Fortalecimiento — prototipo desarrollado y probado', esta_vendiendo: true, promedio_ventas_6_meses: '3200000', empleo_formal_adicional: false, ods: [2, 12, 13], redes: [{ red: 'Instagram', url: 'https://instagram.com/huertaviva' }], pagina_web: null, descripcion_producto: 'Huertas urbanas en canastos reciclados para hogares de Soledad.', documentos: {} },
      { id: uuid(), created_at: hace(2), estado: 'postulado', nombre_completo: 'Jorge Pacheco', correo: 'jorge@prueba.local', whatsapp: '+573004445566', cedula: '72123456', domicilio: 'Cl 30 # 2-11', municipio: 'Barranquilla', nombre_emprendimiento: 'EcoLlantas', tipo_emprendimiento: 'Emprendimiento verde', tipo_formalizacion: 'Persona jurídica', dedicacion_tiempo: 'Parcial', num_colaboradores: 2, etapa_emprendimiento: 'Ideación', esta_vendiendo: false, promedio_ventas_6_meses: '0', empleo_formal_adicional: true, ods: [9, 11, 12], redes: [], pagina_web: null, descripcion_producto: 'Mobiliario urbano con llantas recuperadas.', documentos: {} },
    ],
    evaluaciones: [], correos_enviados: [], storage: [],
    cursos: [
      { id: uuid(), titulo: 'Bienvenida a Innova Social 5.0', descripcion: 'Cómo funciona el acompañamiento.', categoria: 'Inducción', visibilidad: 'todos', cohorte: null, postulacion_id: null, activo: true, solo_beneficiarios: true, orden: 1, portada_url: null, created_at: hace(5) },
      { id: uuid(), titulo: 'Finanzas para emprendimientos verdes', descripcion: 'Costos, precios y flujo de caja.', categoria: 'Finanzas', visibilidad: 'cohorte', cohorte: '5.0', postulacion_id: null, activo: true, solo_beneficiarios: true, orden: 2, portada_url: null, created_at: hace(4) },
      { id: uuid(), titulo: 'Cohorte 6.0 (no debe verse)', descripcion: '', categoria: 'Otro', visibilidad: 'cohorte', cohorte: '6.0', postulacion_id: null, activo: true, solo_beneficiarios: true, orden: 3, portada_url: null, created_at: hace(4) },
    ],
    recursos: [], visitas: [],
    momentos: [], etapas_convocatoria: [], resultados_programa: [], hero_sliders: [],
  };
  s.cursos.forEach((c, i) => s.recursos.push(
    { id: uuid(), curso_id: c.id, modulo: 'Módulo 1', titulo: 'Presentación del módulo', tipo: 'enlace', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', descripcion: 'Video introductorio.', orden: 1, activo: true, solo_beneficiarios: true, created_at: hace(4) },
    { id: uuid(), curso_id: c.id, modulo: 'Módulo 1', titulo: 'Guía de trabajo', tipo: 'enlace', url: 'https://example.com/guia.pdf', descripcion: 'Material para descargar.', orden: 2, activo: true, solo_beneficiarios: true, created_at: hace(4) }));
  const paises = ['Colombia', 'Colombia', 'Colombia', 'Estados Unidos'], disp = ['Celular', 'Escritorio', 'Celular', 'Tablet'], pag = ['/', '/convocatoria', '/postular', '/casos'];
  for (let i = 0; i < 160; i++) s.visitas.push({ creado: hace(i % 28 + Math.random()), pais: paises[i % 4], dispositivo: disp[i % 4], plataforma: i % 3 ? 'Android' : 'Windows', pagina: pag[i % 4] });
  return s;
}

async function load() {
  const c = await caches.open('sim');
  const r = await c.match(KEY);
  if (r) { const s = await r.json(); s.correos_enviados.forEach((c) => { if (c.para) { c.destinatario = c.para; delete c.para; } }); return s; }
  const s = await seed();
  await save(s);
  return s;
}
async function save(s) { const c = await caches.open('sim'); await c.put(KEY, new Response(JSON.stringify(s))); }

// Contenido público real (solo lectura, con la clave anónima) para que el sitio se vea como en producción.
async function traerPublico(s, base, apikey) {
  if (s.__publico) return;
  const q = async (p) => { try { const r = await fetch(base + '/rest/v1/' + p, { headers: { apikey, Authorization: 'Bearer ' + apikey } }); return r.ok ? r.json() : []; } catch (e) { return []; } };
  s.momentos = await q('momentos?select=*&estado=eq.publicado');
  s.etapas_convocatoria = await q('etapas_convocatoria?select=*');
  s.resultados_programa = await q('resultados_programa?select=*');
  s.hero_sliders = await q('hero_sliders?select=*');
  s.__publico = true;
}

// ---------- JWT ----------
const b64u = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const jwt = (u) => b64u({ alg: 'HS256', typ: 'JWT' }) + '.' + b64u({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }) + '.c2ltdWxhZG8';
const userObj = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: now(), app_metadata: { provider: 'email' }, user_metadata: {}, created_at: now() });
const session = (u) => ({ access_token: jwt(u), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'rt-' + u.id, user: userObj(u) });
function quien(s, req) {
  const a = req.headers.get('authorization') || '';
  const tok = a.replace(/^Bearer /, '');
  try {
    const p = JSON.parse(decodeURIComponent(escape(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))));
    const u = s.users.find((x) => x.id === p.sub);
    if (!u) return null;
    return { ...u, perfil: s.profiles.find((x) => x.id === u.id) || { role: 'pendiente' } };
  } catch (e) { return null; }
}

// ---------- puntaje (mismo modelo que public.puntaje_plataforma) ----------
const ODS = [6, 7, 9, 11, 12, 13, 15];
function puntaje(p) {
  const d = [], add = (l, x, m) => d.push([l, x, m]);
  add('¿Está vendiendo?', p.esta_vendiendo === true ? 10 : 0, 10);
  const v = Number(String(p.promedio_ventas_6_meses ?? '').replace(/[^0-9]/g, '') || NaN);
  add('Promedio de ventas', !(v > 0) ? 0 : v < 1e6 ? 2 : v < 5e6 ? 5 : v < 15e6 ? 8 : 10, 10);
  const et = String(p.etapa_emprendimiento || '');
  add('Etapa', /^Ideaci/i.test(et) ? 3 : /^Fortalec/i.test(et) ? 7 : /^Consolid/i.test(et) ? 10 : 0, 10);
  const c = Number(p.num_colaboradores);
  add('Colaboradores', !(c >= 1) ? 0 : c <= 2 ? 4 : c <= 5 ? 7 : 10, 10);
  const f = String(p.tipo_formalizacion || '');
  add('Formalización', /jur[ií]dica/i.test(f) ? 8 : /natural/i.test(f) ? 5 : 0, 8);
  add('Dedicación', p.dedicacion_tiempo === 'Completo' ? 6 : p.dedicacion_tiempo === 'Parcial' ? 3 : 0, 6);
  add('Empleo formal adicional', p.empleo_formal_adicional === false ? 6 : p.empleo_formal_adicional === true ? 2 : 0, 6);
  const t = String(p.tipo_emprendimiento || '').toLowerCase();
  add('Tipo de emprendimiento', t === 'negocio verde' ? 6 : t === 'emprendimiento verde' ? 3 : 0, 6);
  add('ODS prioritarios', [...new Set((p.ods || []).map(Number))].filter((n) => ODS.includes(n)).slice(0, 3).length * 3, 9);
  const nr = Array.isArray(p.redes) ? p.redes.filter((x) => x && x.url).length : 0;
  add('Redes sociales', Math.min(nr, 3) * 2, 6);
  add('Página web', p.pagina_web && nr > 0 ? 2 : 0, 2);
  const pts = d.reduce((a, x) => a + x[1], 0), max = d.reduce((a, x) => a + x[2], 0);
  return { P: Math.round((pts / max) * 1000) / 10, pts, max, detalle: d };
}
const r1 = (x) => Math.round(x * 10) / 10;
function ranking(s) {
  const j1 = s.jurados.find((j) => j.orden === 1), j2 = s.jurados.find((j) => j.orden === 2);
  const w = (s.configuracion.find((c) => c.clave === 'pesos') || {}).valor || {};
  return s.postulaciones.map((p) => {
    const e = (k) => s.evaluaciones.find((x) => x.postulacion_id === p.id && x.entidad === k);
    const e1 = e(j1.clave), e2 = e(j2.clave);
    const sum = (x) => x.pertinencia + x.modelo_negocio + x.innovacion + x.potencial;
    const a = e1 ? r1((sum(e1) / 20) * 100) : null, b = e2 ? r1((sum(e2) / 20) * 100) : null;
    const d = puntaje(p);
    const g = r1((w.plataforma || 0) * d.P + (a == null ? 0 : (w[j1.clave] || 0) * a) + (b == null ? 0 : (w[j2.clave] || 0) * b));
    return {
      id: p.id, created_at: p.created_at, estado: p.estado, orden_desempate: p.orden_desempate ?? null, nota_desempate: p.nota_desempate ?? null,
      puntaje_p: d.P, detalle_p: d, puntaje_j1: a, puntaje_j2: b, jurado_1_nombre: j1.nombre, jurado_2_nombre: j2.nombre,
      calificado_por_j1: e1 && e1.evaluador_nombre, calificado_por_j1_email: e1 && e1.evaluador_email, calificado_j1_en: e1 && e1.updated_at,
      calificado_por_j2: e2 && e2.evaluador_nombre, calificado_por_j2_email: e2 && e2.evaluador_email, calificado_j2_en: e2 && e2.updated_at,
      puntaje_global: g, es_parcial: a == null || b == null,
      falta: a == null && b == null ? 'Faltan ' + j1.nombre + ' y ' + j2.nombre : a == null ? 'Falta ' + j1.nombre : b == null ? 'Falta ' + j2.nombre : null,
      revisar_conjunto: a != null && b != null && Math.abs(a - b) > 25,
    };
  });
}

// ---------- permisos por rol (espejo simplificado de las políticas RLS) ----------
function visibles(s, tabla, w) {
  const rol = w ? w.perfil.role : 'anon', staff = ['admin', 'editor', 'evaluador'].includes(rol);
  const pub = ['momentos', 'etapas_convocatoria', 'resultados_programa', 'hero_sliders', 'jurados'];
  if (tabla === 'ranking_postulaciones') return rol === 'admin' ? ranking(s) : [];
  let rows = s[tabla] || [];
  if (tabla === 'jurados') return staff ? rows : [];
  if (tabla === 'momentos' && !staff) return rows.filter((m) => m.estado === 'publicado');
  if (pub.includes(tabla)) return rows;
  if (rol === 'admin') return rows;
  if (tabla === 'profiles') return w ? rows.filter((p) => p.id === w.id) : [];
  if (tabla === 'configuracion') return staff ? rows : [];
  if (tabla === 'postulaciones') {
    if (rol === 'evaluador') return w.perfil.entidad ? rows : [];
    if (rol === 'beneficiario') return rows.filter((p) => p.user_id === w.id);
    return [];
  }
  if (tabla === 'evaluaciones') return rol === 'evaluador' && w.perfil.entidad ? rows.filter((e) => e.entidad === w.perfil.entidad) : [];
  if (tabla === 'cursos' || tabla === 'recursos') {
    if (rol === 'editor') return rows;
    if (rol !== 'beneficiario') return [];
    const mia = s.postulaciones.find((p) => p.user_id === w.id);
    const ok = (c) => c.activo && (c.visibilidad === 'todos' || (c.visibilidad === 'cohorte' && c.cohorte === w.perfil.cohorte) || (c.visibilidad === 'emprendimiento' && mia && c.postulacion_id === mia.id));
    const cursos = s.cursos.filter(ok);
    return tabla === 'cursos' ? cursos : rows.filter((r) => cursos.some((c) => c.id === r.curso_id));
  }
  return [];
}
function puedeEscribir(s, tabla, w, metodo) {
  const rol = w ? w.perfil.role : 'anon';
  if (tabla === 'postulaciones' && metodo === 'POST') return true;
  if (tabla === 'visitas' && metodo === 'POST') return true;
  if (rol === 'admin') return true;
  if (rol === 'editor') return ['momentos', 'etapas_convocatoria', 'resultados_programa', 'hero_sliders', 'cursos', 'recursos'].includes(tabla);
  if (rol === 'evaluador') return tabla === 'evaluaciones' && !!w.perfil.entidad;
  return false;
}

// ---------- PostgREST mínimo ----------
function filtros(params) {
  const f = [];
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    const m = /^(not\.)?(eq|neq|in|gte|lte|gt|lt|is|like|ilike)\.(.*)$/s.exec(v);
    if (!m) continue;
    const [, neg, op, raw] = m;
    let val = raw;
    if (op === 'in') val = raw.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, ''));
    f.push((r) => {
      const x = r[k];
      const ok = op === 'eq' ? String(x) === val : op === 'neq' ? String(x) !== val : op === 'in' ? val.includes(String(x))
        : op === 'gte' ? String(x) >= val : op === 'lte' ? String(x) <= val : op === 'gt' ? String(x) > val : op === 'lt' ? String(x) < val
        : op === 'is' ? (val === 'null' ? x == null : String(x) === val) : new RegExp('^' + val.replace(/[%*]/g, '.*') + '$', op === 'ilike' ? 'i' : '').test(String(x));
      return neg ? !ok : ok;
    });
  }
  return (r) => f.every((fn) => fn(r));
}
function ordenar(rows, order) {
  if (!order) return rows;
  const keys = order.split(',').map((o) => { const [c, dir] = o.split('.'); return [c, dir === 'desc' ? -1 : 1]; });
  return [...rows].sort((a, b) => { for (const [c, d] of keys) { if (a[c] == b[c]) continue; if (a[c] == null) return 1; if (b[c] == null) return -1; return (a[c] > b[c] ? 1 : -1) * d; } return 0; });
}
function embebidos(s, tabla, rows, select, w) {
  if (!select || !/recursos\(count\)/.test(select)) return rows;
  const rec = visibles(s, 'recursos', w);
  return rows.map((c) => ({ ...c, recursos: [{ count: rec.filter((r) => r.curso_id === c.id).length }] }));
}

const DEF = {
  postulaciones: () => ({ estado: 'postulado', documentos: {}, user_id: null, orden_desempate: null, nota_desempate: null }),
  momentos: () => ({ estado: 'borrador' }), cursos: () => ({ activo: true, orden: 0 }), recursos: () => ({ activo: true, orden: 0 }),
};
const PK = { configuracion: ['clave'], jurados: ['clave'], evaluaciones: ['postulacion_id', 'entidad'] };

async function rest(req, url, s, w) {
  const tabla = url.pathname.split('/').pop();
  const p = url.searchParams, metodo = req.method;
  const accept = req.headers.get('accept') || '', prefer = req.headers.get('prefer') || '';
  const uno = /vnd\.pgrst\.object/.test(accept);
  const responder = (rows, status = 200) => {
    if (uno) {
      if (rows.length !== 1) return J({ code: 'PGRST116', details: 'Results contain ' + rows.length + ' rows', hint: null, message: 'JSON object requested, multiple (or no) rows returned' }, 406);
      return J(rows[0], status);
    }
    return J(rows, status, { 'content-range': (rows.length ? '0-' + (rows.length - 1) : '*') + '/' + rows.length });
  };
  if (metodo === 'GET' || metodo === 'HEAD') {
    let rows = visibles(s, tabla, w).filter(filtros(p));
    rows = ordenar(rows, p.get('order'));
    const total = rows.length;
    if (p.get('limit')) rows = rows.slice(0, Number(p.get('limit')));
    rows = embebidos(s, tabla, rows, p.get('select'), w);
    if (metodo === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': '*/' + total, 'access-control-allow-origin': '*' } });
    if (/count=exact/.test(prefer)) return J(uno ? rows[0] : rows, 200, { 'content-range': '0-' + Math.max(rows.length - 1, 0) + '/' + total });
    return responder(rows);
  }
  if (!puedeEscribir(s, tabla, w, metodo)) {
    if (metodo === 'POST') return J({ code: '42501', message: 'new row violates row-level security policy for table "' + tabla + '"' }, 403);
    return responder([]);
  }
  if (!s[tabla]) s[tabla] = [];
  const devolver = /return=representation/.test(prefer);
  if (metodo === 'POST') {
    let body = await req.json(); if (!Array.isArray(body)) body = [body];
    const upsert = /resolution=merge-duplicates/.test(prefer);
    const pk = p.get('on_conflict') ? p.get('on_conflict').split(',') : PK[tabla] || ['id'];
    const out = [];
    for (const b of body) {
      if (tabla === 'evaluaciones') {
        if (w.perfil.role !== 'admin' && b.entidad !== w.perfil.entidad) return J({ code: '42501', message: 'new row violates row-level security policy for table "evaluaciones"' }, 403);
        if (!s.jurados.some((j) => j.clave === b.entidad)) return J({ code: '23503', message: 'insert or update on table "evaluaciones" violates foreign key constraint' }, 409);
        for (const k of ['pertinencia', 'modelo_negocio', 'innovacion', 'potencial']) if (!(b[k] >= 1 && b[k] <= 5)) return J({ code: '23514', message: 'new row violates check constraint "evaluaciones_' + k + '_check"' }, 400);
        const declara = w.perfil.role === 'admin' && String(b.evaluador_nombre || '').trim() && String(b.evaluador_email || '').trim();
        if (declara && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(b.evaluador_email).trim())) return J({ code: '22023', message: 'El correo de quien califica no es válido' }, 400);
        Object.assign(b, declara
          ? { evaluador_nombre: String(b.evaluador_nombre).trim().slice(0, 120), evaluador_email: String(b.evaluador_email).trim().toLowerCase() }
          : { evaluador_nombre: w.perfil.full_name || w.email, evaluador_email: w.email },
          { evaluador_id: w.id, registrado_por_email: w.email, updated_at: now() });
      }
      if (tabla === 'postulaciones' && (!w || w.perfil.role !== 'admin') && (b.estado && b.estado !== 'postulado' || b.user_id || b.orden_desempate != null)) return J({ code: '42501', message: 'new row violates row-level security policy for table "postulaciones"' }, 403);
      const ex = upsert && s[tabla].find((r) => pk.every((k) => String(r[k]) === String(b[k])));
      if (ex) { Object.assign(ex, b, { updated_at: now() }); out.push(ex); }
      else { const row = { id: uuid(), created_at: now(), updated_at: now(), ...(DEF[tabla] ? DEF[tabla]() : {}), ...b }; s[tabla].push(row); out.push(row); }
    }
    await save(s);
    return devolver ? responder(out, 201) : new Response(null, { status: 201, headers: { 'access-control-allow-origin': '*' } });
  }
  const sel = (s[tabla] || []).filter(filtros(p)).filter((r) => tabla === 'evaluaciones' && w.perfil.role === 'evaluador' ? r.entidad === w.perfil.entidad : true);
  if (metodo === 'PATCH') {
    const b = await req.json();
    sel.forEach((r) => Object.assign(r, b, { updated_at: now() }));
    if (tabla === 'postulaciones') sel.forEach((r) => { if (r.user_id && r.estado === 'ganador') { const pr = s.profiles.find((x) => x.id === r.user_id); if (pr && pr.role === 'pendiente') pr.role = 'beneficiario'; } });
    await save(s);
    return devolver ? responder(sel) : new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*' } });
  }
  if (metodo === 'DELETE') {
    s[tabla] = s[tabla].filter((r) => !sel.includes(r));
    if (tabla === 'postulaciones') s.evaluaciones = s.evaluaciones.filter((e) => !sel.some((r) => r.id === e.postulacion_id));
    await save(s);
    return devolver ? responder(sel) : new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*' } });
  }
  return J({ message: 'método no soportado' }, 405);
}

// ---------- función «correos» ----------
function registrarCorreo(s, c) { const row = { id: uuid(), created_at: now(), estado: 'enviado', error: null, proveedor_id: 'simulado', datos: {}, ...c }; s.correos_enviados.push(row); return row; }
async function correos(req, s, w, origen) {
  const b = await req.json();
  if (b.accion === 'nueva_postulacion') {
    const p = s.postulaciones.find((x) => x.id === b.postulacion_id);
    if (!p) return J({ error: 'Postulación no encontrada' }, 404);
    registrarCorreo(s, { tipo: 'nueva_postulacion', destinatario: 'hola@inngenios.co', asunto: 'Nueva postulación: ' + p.nombre_emprendimiento + ' · P ' + puntaje(p).P, postulacion_id: p.id });
    registrarCorreo(s, { tipo: 'confirmacion_postulante', destinatario: p.correo, asunto: 'Recibimos tu postulación a Innova Social 5.0', postulacion_id: p.id });
    await save(s); return J({ ok: true });
  }
  if (!w || w.perfil.role !== 'admin') return J({ error: 'Solo un administrador puede hacer esto' }, 403);
  if (b.accion === 'invitar_ganador') {
    const p = s.postulaciones.find((x) => x.id === b.postulacion_id);
    if (!p) return J({ error: 'Postulación no encontrada' }, 404);
    let u = s.users.find((x) => x.email === p.correo.toLowerCase());
    if (!u) { u = { id: uuid(), email: p.correo.toLowerCase(), sinClave: true }; s.users.push(u); s.profiles.push({ id: u.id, email: u.email, full_name: null, role: 'pendiente', entidad: null, cohorte: null }); }
    Object.assign(p, { user_id: u.id, estado: 'ganador' });
    const pr = s.profiles.find((x) => x.id === u.id);
    if (['pendiente', 'beneficiario'].includes(pr.role)) Object.assign(pr, { role: 'beneficiario', cohorte: '5.0', full_name: p.nombre_completo });
    const ss = session(u);
    const enlace = origen + '/acceso.html#access_token=' + ss.access_token + '&expires_at=' + ss.expires_at + '&expires_in=3600&refresh_token=' + ss.refresh_token + '&token_type=bearer&type=invite';
    const c = registrarCorreo(s, { tipo: 'bienvenida_ganador', destinatario: p.correo, asunto: 'Te damos la bienvenida a Innova Social 5.0: crea tu acceso', postulacion_id: p.id, enviado_por: w.id, datos: { enlace } });
    await save(s); return J({ ok: true, correo: c });
  }
  if (b.accion === 'invitar_equipo') {
    const nombres = Object.fromEntries(s.jurados.filter((j) => j.activo).map((j) => [j.clave, j.nombre]));
    if (!['admin', 'editor', 'evaluador'].includes(b.rol)) return J({ error: 'Rol no válido' }, 400);
    if (b.rol === 'evaluador' && !(b.entidad && b.entidad in nombres)) return J({ error: 'El evaluador necesita un jurado válido' }, 400);
    if (b.rol === 'admin' && b.entidad && !(b.entidad in nombres)) return J({ error: 'Jurado no válido' }, 400);
    const ent = ['evaluador', 'admin'].includes(b.rol) && b.entidad in nombres ? b.entidad : null;
    const email = String(b.email).toLowerCase();
    let u = s.users.find((x) => x.email === email);
    if (!u) { u = { id: uuid(), email, sinClave: true }; s.users.push(u); s.profiles.push({ id: u.id, email, role: 'pendiente' }); }
    Object.assign(s.profiles.find((x) => x.id === u.id), { role: b.rol, entidad: ent, full_name: b.nombre || null });
    const c = registrarCorreo(s, { tipo: 'invitacion_equipo', destinatario: email, asunto: 'Invitación al panel de Innova Social 5.0', enviado_por: w.id, datos: { nombre: b.nombre, rol: b.rol, entidad: ent, entidad_nombre: ent ? nombres[ent] : null } });
    await save(s); return J({ ok: true, correo: c });
  }
  if (b.accion === 'reenviar') {
    const c = s.correos_enviados.find((x) => x.id === b.correo_id);
    if (!c) return J({ error: 'Correo no encontrado' }, 404);
    const n = registrarCorreo(s, { ...c, id: undefined, created_at: undefined, reenvio_de: c.id });
    n.id = uuid(); n.created_at = now();
    await save(s); return J({ ok: true, correo: n });
  }
  return J({ error: 'Acción desconocida' }, 400);
}

function analitica(s, b) {
  const v = s.visitas.filter((x) => x.creado.slice(0, 10) >= b.desde && x.creado.slice(0, 10) <= b.hasta);
  const g = (k) => Object.entries(v.reduce((a, x) => ((a[x[k]] = (a[x[k]] || 0) + 1), a), {})).map(([k2, n]) => ({ k: k2, n })).sort((a, c) => c.n - a.n);
  const dias = [];
  for (let d = new Date(b.desde + 'T12:00:00'); d.toISOString().slice(0, 10) <= b.hasta; d = new Date(+d + 864e5)) { const k = d.toISOString().slice(0, 10); dias.push({ k, n: v.filter((x) => x.creado.slice(0, 10) === k).length }); }
  return { total: v.length, por_dia: dias, por_dispositivo: g('dispositivo'), por_pais: g('pais'), por_plataforma: g('plataforma'), por_pagina: g('pagina').slice(0, 10) };
}

const PIXEL = 'data:image/svg+xml;utf8,';
async function manejar(req) {
  const url = new URL(req.url);
  const s = await load();
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  const apikey = req.headers.get('apikey') || url.searchParams.get('apikey');
  if (apikey && !s.__publico) { await traerPublico(s, url.origin, apikey); await save(s); }
  const w = quien(s, req);
  const path = url.pathname;
  if (path.startsWith('/auth/v1/')) {
    if (path === '/auth/v1/token') {
      const b = await req.json();
      if (url.searchParams.get('grant_type') === 'password') {
        const u = s.users.find((x) => x.email === String(b.email).toLowerCase());
        if (!u || u.sinClave || b.password !== (u.clave || PASS)) return J({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
        return J(session(u));
      }
      const u = s.users.find((x) => 'rt-' + x.id === b.refresh_token);
      return u ? J(session(u)) : J({ code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' }, 400);
    }
    if (path === '/auth/v1/user' && req.method === 'GET') return w ? J(userObj(w)) : J({ code: 401, msg: 'invalid JWT' }, 401);
    if (path === '/auth/v1/user' && req.method === 'PUT') {
      if (!w) return J({ code: 401, msg: 'invalid JWT' }, 401);
      const b = await req.json(); const u = s.users.find((x) => x.id === w.id);
      if (b.password) { if (String(b.password).length < 6) return J({ code: 422, error_code: 'weak_password', msg: 'Password should be at least 6 characters.' }, 422); u.clave = b.password; u.sinClave = false; }
      await save(s); return J(userObj(u));
    }
    if (path === '/auth/v1/logout') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*' } });
    if (path === '/auth/v1/recover') return J({});
    return J({});
  }
  if (path.startsWith('/rest/v1/rpc/')) {
    const fn = path.split('/').pop(), b = req.method === 'POST' ? await req.json() : {};
    if (fn === 'analitica_resumen') return w && ['admin', 'editor', 'evaluador'].includes(w.perfil.role) ? J(analitica(s, b)) : J({ code: 'P0001', message: 'Solo el equipo puede ver la analítica' }, 400);
    return J({ message: 'rpc no simulada: ' + fn }, 404);
  }
  if (path.startsWith('/rest/v1/')) return rest(req, url, s, w);
  if (path === '/functions/v1/correos') return correos(req, s, w, self.location.origin);
  if (path.startsWith('/storage/v1/object/sign/')) {
    const name = path.replace('/storage/v1/object/sign/', '');
    return J({ signedURL: '/object/' + name + '?token=simulado' });
  }
  if (path.startsWith('/storage/v1/object/')) {
    if (req.method === 'POST' || req.method === 'PUT') {
      const rest2 = path.replace('/storage/v1/object/', '');
      const bucket = rest2.split('/')[0], name = rest2.slice(bucket.length + 1);
      const ct = req.headers.get('content-type') || '';
      s.storage.push({ bucket, name, ct, size: Number(req.headers.get('content-length') || 0), created_at: now() });
      await save(s);
      return J({ Key: rest2, Id: uuid() });
    }
    if (req.method === 'DELETE') return J([]);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="100%" height="100%" fill="#e6efe9"/><text x="50%" y="50%" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#2f5d50">Archivo simulado: ' + path.split('/').pop() + '</text></svg>';
    return new Response(svg, { headers: { 'content-type': 'image/svg+xml' } });
  }
  return J({ message: 'ruta no simulada: ' + path }, 404);
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (!HOST.test(u.hostname)) return;
  e.respondWith(manejar(e.request).catch((err) => J({ message: 'Error del simulador: ' + err.message }, 500)));
});
self.addEventListener('message', async (e) => {
  if (e.data === 'reset') { const c = await caches.open('sim'); await c.delete(KEY); e.ports[0] && e.ports[0].postMessage('ok'); }
  if (e.data === 'estado') { const s = await load(); e.ports[0] && e.ports[0].postMessage(s); }
});

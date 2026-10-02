// Correos automáticos de Innova Social 5.0 (Resend).
//
// Acciones (POST JSON):
//   { accion: 'nueva_postulacion', postulacion_id }        → aviso al programa + confirmación al postulante (público)
//   { accion: 'invitar_ganador', postulacion_id }          → cuenta de beneficiario + bienvenida con enlace (solo admin)
//   { accion: 'invitar_equipo', email, nombre, rol, entidad } → cuenta del equipo + invitación (solo admin)
//   { accion: 'reenviar', correo_id }                      → vuelve a enviar un correo del registro (solo admin)
//
// Secretos: RESEND_API_KEY, CORREO_REMITENTE, CORREO_PROGRAMA, SITE_URL.
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const REMITENTE = Deno.env.get('CORREO_REMITENTE') ?? 'Innova Social <onboarding@resend.dev>';
const CORREO_PROGRAMA = Deno.env.get('CORREO_PROGRAMA') ?? '';
const SITE_URL = (Deno.env.get('SITE_URL') ?? 'https://innova-eta.vercel.app').replace(/\/$/, '');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Tipo = 'nueva_postulacion' | 'confirmacion_postulante' | 'bienvenida_ganador' | 'invitacion_equipo';
type Postulacion = Record<string, any>;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function esc(v: unknown) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function layout(titulo: string, cuerpo: string) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#F2F8FB;font-family:Nunito,Segoe UI,Arial,sans-serif;color:#132330">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F8FB;padding:28px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #E2ECF1">
      <tr><td style="background:#154B73;padding:22px 28px">
        <div style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-.01em">Innova Social <span style="color:#82CA76">5.0</span></div>
        <div style="font-size:12px;color:#CFE3F1;margin-top:3px">Un programa de Triple A e Inngenios</div>
      </td></tr>
      <tr><td style="padding:28px">
        <h1 style="font-size:20px;line-height:1.3;margin:0 0 14px">${esc(titulo)}</h1>
        ${cuerpo}
      </td></tr>
      <tr><td style="padding:16px 28px;border-top:1px solid #E2ECF1;font-size:12px;color:#4F697A">
        Innova Social 5.0 · Barranquilla y municipios del Atlántico donde opera Triple A.<br>
        Este correo se envió automáticamente desde la plataforma del programa.
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function filas(pares: [string, unknown][]) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;margin:0 0 18px">${pares
    .map(([k, v]) => `<tr><td style="padding:6px 0;color:#4F697A;width:42%;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;font-weight:600">${esc(v ?? '—')}</td></tr>`)
    .join('')}</table>`;
}

function boton(href: string, texto: string) {
  return `<p style="margin:22px 0"><a href="${esc(href)}" style="display:inline-block;background:#2279BA;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px">${esc(texto)}</a></p>
  <p style="font-size:12px;color:#4F697A;margin:0 0 6px">Si el botón no funciona, copia este enlace en tu navegador:<br><span style="word-break:break-all">${esc(href)}</span></p>`;
}

async function enviar(opts: {
  tipo: Tipo; para: string; asunto: string; html: string;
  postulacion_id?: string | null; enviado_por?: string | null; datos?: Record<string, unknown>;
}) {
  const { data: log } = await admin.from('correos_enviados').insert({
    tipo: opts.tipo, destinatario: opts.para, asunto: opts.asunto, estado: 'pendiente',
    postulacion_id: opts.postulacion_id ?? null, enviado_por: opts.enviado_por ?? null, datos: opts.datos ?? {},
  }).select('id').single();

  let estado = 'enviado', error: string | null = null, proveedor_id: string | null = null;
  if (!RESEND_API_KEY) {
    estado = 'error'; error = 'RESEND_API_KEY no está configurada';
  } else if (!opts.para) {
    estado = 'error'; error = 'Sin destinatario';
  } else {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: REMITENTE, to: [opts.para], subject: opts.asunto, html: opts.html }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { estado = 'error'; error = body?.message ?? `Resend respondió ${r.status}`; }
      else proveedor_id = body?.id ?? null;
    } catch (e) {
      estado = 'error'; error = String(e);
    }
  }
  if (log?.id) await admin.from('correos_enviados').update({ estado, error, proveedor_id }).eq('id', log.id);
  return { id: log?.id, estado, error };
}

async function llamador(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  if (!data?.user) return null;
  const { data: perfil } = await admin.from('profiles').select('id, role, email').eq('id', data.user.id).maybeSingle();
  return perfil;
}

async function cronograma() {
  const { data } = await admin.from('etapas_convocatoria').select('nombre, fechas_texto, orden').order('orden');
  return (data ?? []) as { nombre: string; fechas_texto: string }[];
}

// ---------- Plantillas ----------
async function correoPrograma(p: Postulacion) {
  const { data: sc } = await admin.rpc('puntaje_postulacion', { pid: p.id });
  const puntaje = sc ? `${String(sc.P).replace('.', ',')} / 100 (${sc.pts} de ${sc.max} puntos)` : '—';
  const html = layout('Nueva postulación recibida', `
    <p style="font-size:14px;line-height:1.6;margin:0 0 16px">Llegó una nueva postulación a Innova Social 5.0.</p>
    <h2 style="font-size:15px;margin:0 0 6px">Postulante</h2>
    ${filas([['Nombre', p.nombre_completo], ['Correo', p.correo], ['WhatsApp', p.whatsapp], ['Municipio', p.municipio]])}
    <h2 style="font-size:15px;margin:0 0 6px">Emprendimiento</h2>
    ${filas([['Nombre', p.nombre_emprendimiento], ['Tipo', p.tipo_emprendimiento], ['Categoría', p.categoria_negocio_verde], ['Subcategoría', p.subcategoria], ['Etapa', p.etapa_emprendimiento]])}
    ${filas([['Puntaje automático (plataforma)', puntaje]])}
    ${boton(`${SITE_URL}/admin.html#participante=${p.id}`, 'Ver ficha en el panel')}`);
  return { asunto: `Nueva postulación: ${p.nombre_emprendimiento} — Innova Social 5.0`, html };
}

async function correoPostulante(p: Postulacion) {
  const etapas = await cronograma();
  const docs = p.documentos && typeof p.documentos === 'object' ? Object.keys(p.documentos).length : 0;
  const pasos = etapas.length
    ? `<ol style="font-size:14px;line-height:1.7;padding-left:20px;margin:0 0 18px">${etapas.map((e) => `<li><b>${esc(e.nombre)}</b> · ${esc(e.fechas_texto)}</li>`).join('')}</ol>`
    : '';
  const html = layout('Recibimos tu postulación', `
    <p style="font-size:14px;line-height:1.6;margin:0 0 16px">Hola ${esc(String(p.nombre_completo ?? '').split(' ')[0])}, tu postulación a <b>Innova Social 5.0</b> quedó registrada con éxito. Este es un resumen de lo que enviaste:</p>
    ${filas([['Emprendimiento', p.nombre_emprendimiento], ['Municipio', p.municipio], ['Categoría', p.categoria_negocio_verde], ['Subcategoría', p.subcategoria], ['Documentos adjuntos', `${docs} de 3`], ['Video', p.video_url ? 'Recibido' : '—']])}
    ${pasos ? `<h2 style="font-size:15px;margin:0 0 6px">Próximos pasos del cronograma</h2>${pasos}` : ''}
    <p style="font-size:14px;line-height:1.6;margin:0">El equipo revisará tu postulación y te contactará por correo y WhatsApp. No necesitas crear una cuenta: el acceso a la plataforma se entrega solo a los emprendimientos seleccionados.</p>`);
  return { asunto: 'Recibimos tu postulación a Innova Social 5.0', html };
}

function correoGanador(p: Postulacion, enlace: string) {
  const html = layout('¡Tu emprendimiento fue seleccionado!', `
    <p style="font-size:14px;line-height:1.6;margin:0 0 12px">Hola ${esc(String(p.nombre_completo ?? '').split(' ')[0])}, <b>${esc(p.nombre_emprendimiento)}</b> es uno de los emprendimientos beneficiarios de Innova Social 5.0.</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 4px">Creamos tu acceso a la plataforma del programa, donde vas a encontrar los cursos, tus entregables y el seguimiento. Para entrar, crea tu contraseña con este enlace:</p>
    ${boton(enlace, 'Crear mi contraseña')}
    <p style="font-size:12px;color:#4F697A;margin:0">Por seguridad, el enlace vence en 24 horas. Si vence, pídele al equipo que te lo reenvíe.</p>`);
  return { asunto: 'Te damos la bienvenida a Innova Social 5.0: crea tu acceso', html };
}

const ROLES: Record<string, string> = {
  admin: 'administrador del panel', editor: 'editor de contenido', evaluador: 'evaluador de postulaciones',
};
const ENTIDADES: Record<string, string> = { inngenios: 'Inngenios', triple_a: 'Triple A' };

function correoEquipo(nombre: string, rol: string, entidad: string | null, enlace: string) {
  const quien = entidad && (rol === 'evaluador' || rol === 'admin')
    ? `${ROLES[rol]} de ${ENTIDADES[entidad] ?? entidad}`
    : ROLES[rol] ?? rol;
  const html = layout('Te invitaron al panel de Innova Social 5.0', `
    <p style="font-size:14px;line-height:1.6;margin:0 0 12px">Hola ${esc(nombre || '')}, te dieron acceso al panel de Innova Social 5.0 como <b>${esc(quien)}</b>.</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 4px">Crea tu contraseña para entrar:</p>
    ${boton(enlace, 'Crear mi contraseña')}
    <p style="font-size:12px;color:#4F697A;margin:0">El enlace vence en 24 horas.</p>`);
  return { asunto: 'Invitación al panel de Innova Social 5.0', html };
}

// Crea la cuenta (o toma la existente) y devuelve un enlace para crear la contraseña.
async function enlaceAcceso(email: string, nombre: string): Promise<{ enlace: string; userId: string }> {
  const redirectTo = `${SITE_URL}/acceso.html`;
  let r = await admin.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo, data: { full_name: nombre } } });
  if (r.error && /already|registered|exists/i.test(r.error.message)) {
    r = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } });
  }
  if (r.error || !r.data?.properties?.action_link || !r.data.user) throw new Error(r.error?.message ?? 'No se pudo generar el enlace de acceso');
  return { enlace: r.data.properties.action_link, userId: r.data.user.id };
}

// ---------- Acciones ----------
async function nuevaPostulacion(id: string) {
  const { data: p } = await admin.from('postulaciones').select('*').eq('id', id).maybeSingle();
  if (!p) return json({ error: 'Postulación no encontrada' }, 404);
  if (Date.now() - new Date(p.created_at).getTime() > 60 * 60 * 1000) return json({ error: 'La postulación es antigua; usa reenviar desde el panel' }, 409);
  const { count } = await admin.from('correos_enviados').select('id', { count: 'exact', head: true }).eq('postulacion_id', id).in('tipo', ['nueva_postulacion', 'confirmacion_postulante']);
  if ((count ?? 0) > 0) return json({ ok: true, ya_enviado: true });

  const out = [];
  const a = await correoPrograma(p);
  out.push(await enviar({ tipo: 'nueva_postulacion', para: CORREO_PROGRAMA, asunto: a.asunto, html: a.html, postulacion_id: id }));
  const b = await correoPostulante(p);
  out.push(await enviar({ tipo: 'confirmacion_postulante', para: p.correo, asunto: b.asunto, html: b.html, postulacion_id: id }));
  return json({ ok: true, correos: out });
}

async function invitarGanador(id: string, porId: string) {
  const { data: p } = await admin.from('postulaciones').select('*').eq('id', id).maybeSingle();
  if (!p) return json({ error: 'Postulación no encontrada' }, 404);
  const { enlace, userId } = await enlaceAcceso(p.correo, p.nombre_completo);
  await admin.from('postulaciones').update({ user_id: userId, estado: 'ganador' }).eq('id', id);
  await admin.from('profiles').update({ role: 'beneficiario', cohorte: '5.0', full_name: p.nombre_completo }).eq('id', userId).in('role', ['pendiente', 'beneficiario']);
  const c = correoGanador(p, enlace);
  const r = await enviar({ tipo: 'bienvenida_ganador', para: p.correo, asunto: c.asunto, html: c.html, postulacion_id: id, enviado_por: porId });
  return json({ ok: true, correo: r });
}

async function invitarEquipo(email: string, nombre: string, rol: string, entidad: string | null, porId: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: 'Correo no válido' }, 400);
  if (!['admin', 'editor', 'evaluador'].includes(rol)) return json({ error: 'Rol no válido' }, 400);
  if (rol === 'evaluador' && !['inngenios', 'triple_a'].includes(entidad ?? '')) return json({ error: 'El evaluador necesita entidad (inngenios o triple_a)' }, 400);
  if (rol === 'admin' && entidad && !['inngenios', 'triple_a'].includes(entidad)) return json({ error: 'Entidad no válida' }, 400);
  const ent = (rol === 'evaluador' || rol === 'admin') && ['inngenios', 'triple_a'].includes(entidad ?? '') ? entidad : null;
  const { enlace, userId } = await enlaceAcceso(email.toLowerCase(), nombre);
  await admin.from('profiles').update({ role: rol, entidad: ent, full_name: nombre || null }).eq('id', userId);
  const c = correoEquipo(nombre, rol, ent, enlace);
  const r = await enviar({ tipo: 'invitacion_equipo', para: email.toLowerCase(), asunto: c.asunto, html: c.html, enviado_por: porId, datos: { nombre, rol, entidad: ent } });
  return json({ ok: true, correo: r });
}

async function reenviar(correoId: string, porId: string) {
  const { data: c } = await admin.from('correos_enviados').select('*').eq('id', correoId).maybeSingle();
  if (!c) return json({ error: 'Correo no encontrado' }, 404);
  if (c.tipo === 'invitacion_equipo') {
    const d = c.datos ?? {};
    return invitarEquipo(c.destinatario, d.nombre ?? '', d.rol ?? 'editor', d.entidad ?? null, porId);
  }
  const { data: p } = await admin.from('postulaciones').select('*').eq('id', c.postulacion_id).maybeSingle();
  if (!p) return json({ error: 'La postulación de este correo ya no existe' }, 404);
  if (c.tipo === 'bienvenida_ganador') return invitarGanador(p.id, porId);
  const t = c.tipo === 'nueva_postulacion' ? await correoPrograma(p) : await correoPostulante(p);
  const para = c.tipo === 'nueva_postulacion' ? CORREO_PROGRAMA : p.correo;
  return json({ ok: true, correo: await enviar({ tipo: c.tipo, para, asunto: t.asunto, html: t.html, postulacion_id: p.id, enviado_por: porId }) });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  try {
    if (body.accion === 'nueva_postulacion') {
      if (typeof body.postulacion_id !== 'string') return json({ error: 'Falta postulacion_id' }, 400);
      return await nuevaPostulacion(body.postulacion_id);
    }
    const quien = await llamador(req);
    if (!quien || quien.role !== 'admin') return json({ error: 'Solo un administrador puede hacer esto' }, 403);
    if (body.accion === 'invitar_ganador') return await invitarGanador(String(body.postulacion_id), quien.id);
    if (body.accion === 'invitar_equipo') return await invitarEquipo(String(body.email ?? '').trim(), String(body.nombre ?? '').trim(), String(body.rol ?? ''), body.entidad ?? null, quien.id);
    if (body.accion === 'reenviar') return await reenviar(String(body.correo_id), quien.id);
    return json({ error: 'Acción desconocida' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

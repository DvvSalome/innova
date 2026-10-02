// Registra una visita en Supabase (tabla visitas). Sin cookies ni IP: página, dispositivo,
// sistema operativo, país (encabezado de geolocalización de Vercel) y dominio de referencia.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yivyqorgcagwykedngjv.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlpdnlxb3JnY2Fnd3lrZWRuZ2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwOTU5NzIsImV4cCI6MjEwNTY3MTk3Mn0.3YqnXyGVMPpDz8m2-fQzgtaJ6Y_MQvWfgexdD7g5w48';

const BOTS = /bot|crawl|spider|slurp|preview|monitor|lighthouse|headless|facebookexternalhit|whatsapp/i;
const paises = new Intl.DisplayNames(['es'], { type: 'region' });

function dispositivo(ua) {
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua))) return 'iPad';
  if (/iPhone|iPod/i.test(ua)) return 'iPhone';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows|Macintosh|Linux|CrOS/i.test(ua)) return 'Escritorio';
  return 'Otro';
}

function plataforma(ua) {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/CrOS/i.test(ua)) return 'ChromeOS';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Otro';
}

function pais(code) {
  if (!code || !/^[A-Z]{2}$/.test(code)) return 'Desconocido';
  try { return paises.of(code) || code; } catch { return code; }
}

export async function POST(request) {
  const ua = request.headers.get('user-agent') || '';
  if (BOTS.test(ua)) return new Response(null, { status: 204 });

  let body = {};
  try { body = await request.json(); } catch { return new Response(null, { status: 204 }); }

  const pagina = String(body.p || '/').slice(0, 200);
  const host = request.headers.get('host') || '';
  const ref = String(body.r || '').slice(0, 200);
  const fila = {
    pagina,
    dispositivo: dispositivo(ua),
    plataforma: plataforma(ua),
    pais: pais(request.headers.get('x-vercel-ip-country')),
    referente: ref && ref !== host ? ref : null,
  };

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/visitas`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(fila),
    });
  } catch {
    // La analítica nunca debe romper la navegación.
  }
  return new Response(null, { status: 204 });
}

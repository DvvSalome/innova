import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const MIG = '/home/dvv-salom3/dev/freelance/inngenios/INNOOVASOCIAL/supabase/migrations';

export async function build({ extra = [] } = {}) {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(readFileSync('bootstrap.sql', 'utf8'));

  const files = readdirSync(MIG).filter(f => f.endsWith('.sql')).sort();
  const applied = [];
  for (const f of files) {
    const sql = readFileSync(path.join(MIG, f), 'utf8');
    try { await db.exec(sql); applied.push({ f, ok: true }); }
    catch (e) { applied.push({ f, ok: false, err: e.message }); }
  }
  // Supabase otorga de fábrica los privilegios de tabla a anon/authenticated;
  // lo que restringe de verdad es RLS. Sin esto, todo falla por GRANT y la
  // matriz mediría lo que no es.
  await db.exec(`
    grant select, insert, update, delete on all tables in schema public to anon, authenticated;
    grant all on all tables in schema public to service_role;
    grant usage, select on all sequences in schema public to anon, authenticated, service_role;
    grant execute on all functions in schema public to anon, authenticated, service_role;
  `);
  // ...y luego se revoca lo que las migraciones cerraron a propósito.
  await db.exec(`
    revoke execute on function public.mi_entidad() from anon;
    revoke execute on function public.puntaje_postulacion(uuid) from public, anon, authenticated;
  `).catch(() => {});
  for (const sql of extra) await db.exec(sql);
  return { db, applied };
}

// Ejecuta como un rol/usuario concreto, igual que una sesión de Supabase.
export async function as(db, who, sql, params) {
  const claims = who.id
    ? `set local request.jwt.claim.sub='${who.id}'; set local request.jwt.claim.role='${who.role||'authenticated'}'; set local request.jwt.claim.email='${who.email||''}';`
    : `set local request.jwt.claim.role='anon';`;
  await db.exec('begin');
  try {
    await db.exec(`set local role ${who.id ? (who.role === 'service_role' ? 'service_role' : 'authenticated') : 'anon'}; ${claims}`);
    const r = params ? await db.query(sql, params) : await db.query(sql);
    await db.exec('rollback');
    return { ok: true, rows: r.rows };
  } catch (e) {
    await db.exec('rollback');
    return { ok: false, err: e.message };
  }
}

// Igual que `as`, pero conserva los cambios (para sembrar).
export async function asCommit(db, who, sql, params) {
  const claims = who.id
    ? `set local request.jwt.claim.sub='${who.id}'; set local request.jwt.claim.role='${who.role||'authenticated'}'; set local request.jwt.claim.email='${who.email||''}';`
    : `set local request.jwt.claim.role='anon';`;
  await db.exec('begin');
  try {
    await db.exec(`set local role ${who.id ? (who.role === 'service_role' ? 'service_role' : 'authenticated') : 'anon'}; ${claims}`);
    const r = params ? await db.query(sql, params) : await db.query(sql);
    await db.exec('commit');
    return { ok: true, rows: r.rows };
  } catch (e) {
    await db.exec('rollback');
    return { ok: false, err: e.message };
  }
}

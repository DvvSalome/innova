// Los 6 usuarios de prueba. Correos de ejemplo, dominio example.com a propósito.
export const P = {
  admin:   { id:'aaaaaaaa-0000-4000-8000-000000000001', email:'admin@example.com',    nombre:'Ana Admin',          role:'admin',        entidad:null },
  editor:  { id:'aaaaaaaa-0000-4000-8000-000000000002', email:'editor@example.com',   nombre:'Elena Editora',      role:'editor',       entidad:null },
  jurado1: { id:'aaaaaaaa-0000-4000-8000-000000000003', email:'jurado1@example.com',  nombre:'Julio Jurado Uno',   role:'evaluador',    entidad:'jurado_1' },
  jurado2: { id:'aaaaaaaa-0000-4000-8000-000000000004', email:'jurado2@example.com',  nombre:'Julia Jurado Dos',   role:'evaluador',    entidad:'jurado_2' },
  benef:   { id:'aaaaaaaa-0000-4000-8000-000000000005', email:'beneficiario@example.com', nombre:'Beto Beneficiario', role:'beneficiario', entidad:null },
  pend:    { id:'aaaaaaaa-0000-4000-8000-000000000006', email:'pendiente@example.com',nombre:'Pedro Pendiente',    role:'pendiente',    entidad:null },
};
export const ANON = { id:null };
export const SVC  = { id:'aaaaaaaa-0000-4000-8000-00000000000f', email:'svc@example.com', role:'service_role' };

export const POSTULACION_ID = 'bbbbbbbb-0000-4000-8000-000000000001';

export async function seed(db) {
  for (const k of Object.keys(P)) {
    const u = P[k];
    await db.query(`insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing`, [u.id, u.email]);
    await db.query(
      `insert into public.profiles (id, email, full_name, role, entidad) values ($1,$2,$3,$4,$5)
       on conflict (id) do update set full_name=excluded.full_name, role=excluded.role, entidad=excluded.entidad`,
      [u.id, u.email, u.nombre, u.role, u.entidad]);
  }
  await db.query(`insert into auth.users (id,email) values ($1,$2) on conflict (id) do nothing`, [SVC.id, SVC.email]);
  // El admin debe estar en la whitelist para que is_admin() lo reconozca.
  await db.query(`insert into public.admin_whitelist (email) values ($1) on conflict do nothing`, [P.admin.email])
    .catch(()=>{});
}

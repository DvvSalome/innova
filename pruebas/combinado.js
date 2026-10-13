import { build, as } from './db.js';
import { readFileSync } from 'node:fs';

// Base al estado de producción: migraciones hasta la última aplicada allá,
// SIN las dos que vamos a correr.
const { db, applied } = await build({ hasta: '20261002160000_zzz' });
console.log('Migraciones base aplicadas:', applied.length, '· fallos:', applied.filter(a=>!a.ok).length);

// Replicar lo que hay HOY en producción.
await db.query(`insert into auth.users (id,email) values
  ('c7011bd1-2199-40f7-905b-ee3451ed99d4','cristian@inngenios.co')`);
await db.query(`insert into public.profiles (id,email,full_name,role,entidad)
  values ('c7011bd1-2199-40f7-905b-ee3451ed99d4','cristian@inngenios.co','Cristian','admin','inngenios')
  on conflict (id) do update set role='admin', entidad='inngenios'`);
await db.query(`insert into public.configuracion (clave,valor)
  values ('pesos','{"triple_a":0.3,"inngenios":0.3,"plataforma":0.4}'::jsonb)
  on conflict (clave) do update set valor=excluded.valor`);
// La postulación sembrada, con ventas en texto: la que hoy tumba el ranking.
await db.query(`insert into public.postulaciones
  (id,nombre_completo,correo,whatsapp,cedula,municipio,domicilio,nombre_emprendimiento,tipo_emprendimiento,
   num_colaboradores,promedio_ventas_6_meses,esta_vendiendo,etapa_emprendimiento,tipo_formalizacion,
   dedicacion_tiempo,empleo_formal_adicional,ods,redes,pagina_web,rango_ganancias)
  values ('0f18244b-849f-4184-b576-bc05fec318a2','[PRUEBA] Valentina Ríos Mendoza','prueba@example.com',
   '+573000000000','123','Barranquilla','Barranquilla','[PRUEBA] Raíz Costeña','Emprendimiento verde',
   4,'$1.800.000 / mes',true,'Fortalecimiento','Persona jurídica','Completo',false,array[6,12,13],
   '[{"red":"Instagram","url":"https://instagram.com/x"},{"red":"Facebook","url":"https://facebook.com/x"}]'::jsonb,
   'https://example.com','$1.000.000 – $3.000.000')`);

const antes = await db.query(`select id, puntaje_global from public.ranking_postulaciones`).then(
  r => 'ok (' + r.rows.length + ')', e => 'ERROR: ' + e.message.split('\n')[0]);
console.log('ANTES  ranking_postulaciones ->', antes);

// Correr el archivo combinado tal cual se lo entregamos.
let sql = readFileSync('/home/dvv-salom3/dev/freelance/inngenios/INNOOVASOCIAL/supabase/APLICAR-EN-PRODUCCION.sql','utf8');
try { await db.exec(sql); console.log('ARCHIVO COMBINADO -> aplicado sin error'); }
catch (e) { console.log('ARCHIVO COMBINADO -> FALLO:', e.message.split('\n')[0]); process.exit(1); }

const despues = await db.query(`select puntaje_p, puntaje_j1, puntaje_j2, puntaje_global, es_parcial, falta,
  jurado_1_nombre, jurado_2_nombre from public.ranking_postulaciones`);
console.log('DESPUÉS ranking_postulaciones ->', JSON.stringify(despues.rows[0]));
console.log('pesos  ->', JSON.stringify((await db.query(`select valor from public.configuracion where clave='pesos'`)).rows[0].valor));
console.log('perfil ->', JSON.stringify((await db.query(`select email, role, entidad from public.profiles where email='cristian@inngenios.co'`)).rows[0]));
console.log('jurados->', JSON.stringify((await db.query(`select clave,nombre,orden from public.jurados order by orden`)).rows));

// Idempotencia: correrlo dos veces no debe romper.
try { await db.exec(sql); console.log('SEGUNDA PASADA -> ok (idempotente)'); }
catch (e) { console.log('SEGUNDA PASADA -> FALLO:', e.message.split('\n')[0]); }

// El trigger sigue sellando al calificador.
await db.query(`insert into auth.users (id,email) values ('aaaaaaaa-0000-4000-8000-000000000003','jurado1@example.com')`);
await db.query(`insert into public.profiles (id,email,full_name,role,entidad) values
  ('aaaaaaaa-0000-4000-8000-000000000003','jurado1@example.com','Julio Jurado Uno','evaluador','jurado_1')
  on conflict (id) do update set full_name='Julio Jurado Uno', role='evaluador', entidad='jurado_1'`);
const ins = await as(db, { id:'aaaaaaaa-0000-4000-8000-000000000003', email:'jurado1@example.com' },
  `insert into public.evaluaciones (postulacion_id,entidad,pertinencia,modelo_negocio,innovacion,potencial)
   values ('0f18244b-849f-4184-b576-bc05fec318a2','jurado_1',4,4,4,4)
   returning evaluador_nombre, evaluador_email`);
console.log('sello del calificador ->', ins.ok ? JSON.stringify(ins.rows[0]) : 'FALLO: ' + ins.err);

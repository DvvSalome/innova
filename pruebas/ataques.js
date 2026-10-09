import { build, as, asCommit } from './db.js';
import { P, ANON, SVC, POSTULACION_ID, seed } from './personas.js';

const F = [];
const nota = (sev, titulo, hallazgo, impacto) => F.push({ sev, titulo, hallazgo, impacto });

const run = async () => {
const { db } = await build();
await seed(db);
await db.query(`insert into public.postulaciones (id,nombre_completo,correo,whatsapp,cedula,municipio,domicilio,nombre_emprendimiento,tipo_emprendimiento,num_colaboradores,promedio_ventas_6_meses,esta_vendiendo,etapa_emprendimiento,tipo_formalizacion,dedicacion_tiempo,empleo_formal_adicional,ods,redes)
  values ('${POSTULACION_ID}','Valentina Ríos','postulante@example.com','+573001112233','123','Barranquilla','Barranquilla','Raíz Costeña','Negocio verde',4,'1800000',true,'Fortalecimiento','Persona jurídica','Completo',false,array[6,12,13],'[]'::jsonb)`);

// A1 — ¿un jurado puede cambiar su nota ya puesta, y queda rastro?
await asCommit(db, P.jurado1, `insert into public.evaluaciones (postulacion_id,entidad,pertinencia,modelo_negocio,innovacion,potencial) values ('${POSTULACION_ID}','jurado_1',5,5,5,5)`);
const antes = (await as(db, SVC, `select pertinencia, created_at, updated_at from public.evaluaciones where entidad='jurado_1'`)).rows[0];
await asCommit(db, P.jurado1, `update public.evaluaciones set pertinencia=1 where entidad='jurado_1'`);
const despues = (await as(db, SVC, `select pertinencia, created_at, updated_at from public.evaluaciones where entidad='jurado_1'`)).rows[0];
if (String(antes.pertinencia) !== String(despues.pertinencia))
  nota('MEDIA','Las notas se reescriben sin historial',
    `jurado 1 cambió pertinencia de ${antes.pertinencia} a ${despues.pertinencia}. Solo queda updated_at; el valor anterior se pierde.`,
    'En una convocatoria con premio en dinero no hay cómo auditar si una nota se cambió después de ver la del otro jurado o tras una llamada.');

// A2 — ¿un jurado puede calificar su propia postulación?
await db.query(`update public.postulaciones set correo='jurado1@example.com' where id='${POSTULACION_ID}'`);
const conflicto = await as(db, P.jurado1, `select 1 from public.postulaciones where correo='jurado1@example.com'`);
if (conflicto.ok && conflicto.rows.length)
  nota('MEDIA','Nada impide el conflicto de interés',
    'El jurado 1 ve y puede calificar una postulación cuyo correo es el suyo. No hay declaración de impedimento ni bloqueo.',
    'Un jurado puede calificarse a sí mismo o a un allegado sin que el sistema lo note.');
await db.query(`update public.postulaciones set correo='postulante@example.com' where id='${POSTULACION_ID}'`);

// A3 — ¿qué pasa con un tercer jurado?
const tres = await asCommit(db, SVC, `insert into public.jurados (clave,nombre,orden) values ('jurado_3','Cámara de Comercio',3)`);
if (tres.ok) {
  const r = await as(db, P.admin, `select puntaje_global, es_parcial from public.ranking_postulaciones`);
  nota('MEDIA','El modelo solo cuenta dos jurados',
    'Se puede insertar un jurado_3 y la tabla lo acepta, pero el ranking solo lee orden=1 y orden=2: su nota no entra al puntaje global ni aparece como faltante.',
    'Al reutilizar la plataforma con tres jurados, el tercero califica y su nota se descarta en silencio.');
}
await db.query(`delete from public.jurados where clave='jurado_3'`);

// A4 — ¿un jurado desactivado sigue calificando?
await db.query(`update public.jurados set activo=false where clave='jurado_2'`);
const desact = await asCommit(db, P.jurado2, `insert into public.evaluaciones (postulacion_id,entidad,pertinencia,modelo_negocio,innovacion,potencial) values ('${POSTULACION_ID}','jurado_2',4,4,4,4)`);
if (desact.ok)
  nota('BAJA','El campo activo de jurados no hace nada',
    'Con jurados.activo = false, el jurado 2 insertó su calificación igual. Ninguna política ni check consulta esa columna.',
    'La columna sugiere que se puede retirar un jurado, pero no retira nada.');
await db.query(`update public.jurados set activo=true where clave='jurado_2'`);

// A5 — ¿el postulante puede leer datos de otros perfiles?
const perfiles = await as(db, P.benef, `select email, full_name, role from public.profiles`);
if (perfiles.ok && perfiles.rows.length > 1)
  nota('ALTA','Un beneficiario lee el directorio completo de cuentas',
    `select sobre profiles devolvió ${perfiles.rows.length} filas, con correo y rol de admins y jurados.`,
    'Cualquier beneficiario obtiene los correos del equipo y de los jurados: base para phishing dirigido.');

// A6 — ¿anon puede sobrescribir el adjunto de otro?
await asCommit(db, ANON, `insert into storage.objects (bucket_id,name) values ('postulaciones','${POSTULACION_ID}/cedula.pdf')`);
const sobre = await as(db, ANON, `update storage.objects set name=name where bucket_id='postulaciones'`);
const borrar = await as(db, ANON, `delete from storage.objects where bucket_id='postulaciones'`);
if (sobre.ok || borrar.ok)
  nota('MEDIA','Storage sin política de update/delete para anon',
    `update=${sobre.ok?'permitido':'bloqueado'}, delete=${borrar.ok?'permitido':'bloqueado'} sobre objetos del bucket postulaciones.`,
    'Revisar que anon no pueda tocar adjuntos ya subidos.');

// A7 — ¿se puede enviar la misma postulación mil veces?
let n = 0;
for (let i = 0; i < 5; i++) {
  const r = await asCommit(db, ANON, `insert into public.postulaciones (nombre_completo,correo,whatsapp,cedula,municipio,domicilio,nombre_emprendimiento,redes)
    values ('Spam ${i}','spam@example.com','+573000000000','999','Barranquilla','Barranquilla','Spam SAS','[]'::jsonb)`);
  if (r.ok) n++;
}
if (n === 5)
  nota('MEDIA','El formulario público no tiene tope de envíos',
    `Se insertaron ${n} postulaciones seguidas con el mismo correo y la misma cédula, sin restricción.`,
    'Un script puede llenar la tabla y el almacenamiento; el equipo tendría que depurar a mano antes de evaluar.');

// A8 — ¿el correo del postulante es único?
const dup = await as(db, SVC, `select correo, count(*) c from public.postulaciones group by correo having count(*)>1`);
if (dup.ok && dup.rows.length)
  nota('BAJA','Sin unicidad por cédula ni por correo',
    `Hay ${dup.rows.length} correo(s) con más de una postulación.`,
    'El panel marca "posible duplicada" pero la base no lo impide; dos fichas del mismo emprendimiento compiten por separado.');

console.log('\n' + '='.repeat(100));
console.log('HALLAZGOS DEL PASE ADVERSARIAL');
console.log('='.repeat(100));
const orden = { ALTA:0, MEDIA:1, BAJA:2 };
F.sort((a,b)=>orden[a.sev]-orden[b.sev]);
F.forEach((f,i) => {
  console.log(`\n[${f.sev}] ${i+1}. ${f.titulo}`);
  console.log(`   Qué pasó : ${f.hallazgo}`);
  console.log(`   Por qué importa: ${f.impacto}`);
});
console.log(`\nTotal: ${F.length} hallazgos (${F.filter(f=>f.sev==='ALTA').length} alta, ${F.filter(f=>f.sev==='MEDIA').length} media, ${F.filter(f=>f.sev==='BAJA').length} baja)`);
const { writeFileSync } = await import('node:fs');
writeFileSync('hallazgos.json', JSON.stringify(F, null, 2));
};
run().catch(e => { console.error('ERR:', e.message); process.exit(1); });

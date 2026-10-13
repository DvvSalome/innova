import { build, as, asCommit } from './db.js';
import { P, ANON, SVC, POSTULACION_ID, seed } from './personas.js';
import { writeFileSync } from 'node:fs';

const { db } = await build();
await seed(db);

// Postulación completa, enviada por el formulario público.
await asCommit(db, ANON, `insert into public.postulaciones
 (id,nombre_completo,correo,whatsapp,tipo_documento,cedula,genero,fecha_nacimiento,domicilio,municipio,estrato,
  nivel_educacion,empleo_formal_adicional,nombre_emprendimiento,tipo_emprendimiento,tipo_formalizacion,
  categoria_negocio_verde,subcategoria,dedicacion_tiempo,num_colaboradores,ods,descripcion_producto,
  descripcion_problema,descripcion_impacto,descripcion_clientes,promedio_ventas_6_meses,redes_sociales,redes,
  pagina_web,rango_ganancias,uso_recurso,poblacion_priorizada,discapacidad,etapa_emprendimiento,
  ha_recibido_financiacion,esta_vendiendo,necesidades,video_url,documentos)
 values ('${POSTULACION_ID}','Valentina Ríos Mendoza','valentina@example.com','+573001112233','CC','1098765432',
  'Femenino','1995-05-05','Barranquilla','Barranquilla','3','Universitario',false,'Raíz Costeña','Negocio verde',
  'Persona jurídica','Aprovechamiento y valorización de residuos','Compostaje','Completo',4,array[6,12,13],
  'Compostaje de residuos orgánicos de plazas de mercado, convertidos en abono para huertas urbanas del Atlántico.',
  'Las plazas de mercado de Barranquilla botan toneladas de orgánicos que terminan en el relleno de Los Pocitos.',
  'En 18 meses procesamos 42 toneladas de residuos y vinculamos a 9 recicladoras de oficio de La Chinita.',
  'Viveros, huertas urbanas y dos cadenas de supermercados locales.','1800000',
  'Instagram: https://instagram.com/raizcostena','[{"red":"Instagram","url":"https://instagram.com/raizcostena"},{"red":"Facebook","url":"https://facebook.com/raizcostena"}]'::jsonb,
  'https://raizcostena.co','$1.000.000 – $3.000.000',
  'Compraríamos una trituradora industrial para triplicar la capacidad de procesamiento y contratar dos personas más.',
  'Ninguna','No','Fortalecimiento',false,true,array['Capital','Mentoría'],'https://www.youtube.com/watch?v=abc',
  '{"cedula":"${POSTULACION_ID}/cedula.pdf","rut":"${POSTULACION_ID}/rut.pdf","recibo_triple_a":"${POSTULACION_ID}/recibo_triple_a.pdf"}'::jsonb)`);

await asCommit(db, ANON, `insert into storage.objects (bucket_id,name) values
  ('postulaciones','${POSTULACION_ID}/cedula.pdf'),('postulaciones','${POSTULACION_ID}/rut.pdf'),
  ('postulaciones','${POSTULACION_ID}/recibo_triple_a.pdf')`);

await asCommit(db, P.jurado1, `insert into public.evaluaciones (postulacion_id,entidad,pertinencia,modelo_negocio,innovacion,potencial,comentario)
  values ('${POSTULACION_ID}','jurado_1',5,4,4,3,'Impacto territorial claro y medible. El modelo aún depende de pocos clientes.')`);
await asCommit(db, P.jurado2, `insert into public.evaluaciones (postulacion_id,entidad,pertinencia,modelo_negocio,innovacion,potencial,comentario)
  values ('${POSTULACION_ID}','jurado_2',4,3,3,3,'Buena tracción, falta proyección financiera a 12 meses.')`);

await db.query(`insert into public.cursos (id,titulo,descripcion,activo,categoria) values
  ('dddddddd-0000-4000-8000-000000000001','Bootcamp · Modelo de negocio sostenible','Cuatro sesiones para estructurar la propuesta de valor.',true,'Bootcamp')`);

// Lo que ve cada rol, con su propia RLS.
const vistas = {};
for (const [nombre, who] of Object.entries({ admin: P.admin, editor: P.editor, jurado1: P.jurado1, jurado2: P.jurado2, beneficiario: P.benef })) {
  const q = async (sql) => (await as(db, who, sql)).rows || [];
  vistas[nombre] = {
    perfil: (await q(`select id,email,full_name,role,entidad from public.profiles where id='${who.id}'`))[0],
    jurados: await q(`select clave,nombre,orden from public.jurados order by orden`),
    postulaciones: await q(`select * from public.postulaciones`),
    evaluaciones: await q(`select * from public.evaluaciones`),
    ranking: await q(`select * from public.ranking_postulaciones`),
    cursos: await q(`select * from public.cursos`),
    configuracion: await q(`select clave,valor from public.configuracion`),
    momentos: await q(`select id,titulo,slug,estado from public.momentos`),
  };
}
writeFileSync('fixtures.json', JSON.stringify(vistas, null, 1));
console.log('Filas visibles por rol:');
for (const [k,v] of Object.entries(vistas))
  console.log(`  ${k.padEnd(14)} postulaciones=${v.postulaciones.length}  evaluaciones=${v.evaluaciones.length}  ranking=${v.ranking.length}  cursos=${v.cursos.length}`);
console.log('\nRanking visto por el admin:');
const r = vistas.admin.ranking[0];
console.log(`  P=${r.puntaje_p}  ${r.jurado_1_nombre}=${r.puntaje_j1} (${r.calificado_por_j1} <${r.calificado_por_j1_email}>)`);
console.log(`           ${r.jurado_2_nombre}=${r.puntaje_j2} (${r.calificado_por_j2} <${r.calificado_por_j2_email}>)`);
console.log(`  GLOBAL=${r.puntaje_global}  parcial=${r.es_parcial}`);

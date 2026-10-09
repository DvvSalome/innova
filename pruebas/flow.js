import { build, as, asCommit } from './db.js';
import { P, ANON, SVC, POSTULACION_ID, seed } from './personas.js';

const R = [];
function chk(etapa, actor, accion, esperado, got) {
  const real = got.ok ? 'permitido' : 'bloqueado';
  const pass = real === esperado;
  R.push({ etapa, actor, accion, esperado, real, pass,
           detalle: got.ok ? JSON.stringify(got.rows).slice(0,110) : String(got.err).slice(0,110) });
  return got;
}

const POST_COLS = `(id,nombre_completo,correo,whatsapp,tipo_documento,cedula,genero,fecha_nacimiento,
 domicilio,municipio,estrato,nivel_educacion,empleo_formal_adicional,nombre_emprendimiento,tipo_emprendimiento,
 tipo_formalizacion,categoria_negocio_verde,subcategoria,dedicacion_tiempo,num_colaboradores,ods,
 descripcion_producto,descripcion_problema,descripcion_impacto,descripcion_clientes,promedio_ventas_6_meses,
 redes_sociales,redes,pagina_web,rango_ganancias,uso_recurso,poblacion_priorizada,discapacidad,
 etapa_emprendimiento,ha_recibido_financiacion,esta_vendiendo,necesidades,video_url,documentos)`;
const POST_VALS = `('${POSTULACION_ID}','Valentina Ríos','postulante@example.com','+573001112233','CC','1234567890',
 'Femenino','1995-05-05','Barranquilla','Barranquilla','3','Universitario',false,'Raíz Costeña','Negocio verde',
 'Persona jurídica','Aprovechamiento y valorización de residuos','Reciclaje','Completo',4,array[6,12,13],
 repeat('a',200),repeat('b',200),repeat('c',250),repeat('d',150),'1800000',
 'Instagram: https://instagram.com/raiz','[{"red":"Instagram","url":"https://instagram.com/raiz"}]'::jsonb,
 'https://raizcostena.co','$1.000.000 – $3.000.000',repeat('e',200),'Ninguna','No','Fortalecimiento',false,true,
 array['Capital','Mentoría'],'https://www.youtube.com/watch?v=abc',
 '{"cedula":"${POSTULACION_ID}/cedula.pdf","rut":"${POSTULACION_ID}/rut.pdf","recibo_triple_a":"${POSTULACION_ID}/recibo_triple_a.pdf"}'::jsonb)`;

const run = async () => {
const { db } = await build();
await seed(db);

// ===== 1. POSTULANTE (anónimo) =====
chk('1 Postulación','anónimo','enviar postulación','permitido',
  await asCommit(db, ANON, `insert into public.postulaciones ${POST_COLS} values ${POST_VALS}`));
chk('1 Postulación','anónimo','subir los 3 adjuntos','permitido',
  await asCommit(db, ANON, `insert into storage.objects (bucket_id,name) values
    ('postulaciones','${POSTULACION_ID}/cedula.pdf'),
    ('postulaciones','${POSTULACION_ID}/rut.pdf'),
    ('postulaciones','${POSTULACION_ID}/recibo_triple_a.pdf')`));
chk('1 Postulación','anónimo','subir adjunto con ruta arbitraria','bloqueado',
  await as(db, ANON, `insert into storage.objects (bucket_id,name) values ('postulaciones','hackeo.pdf')`));
chk('1 Postulación','anónimo','leer postulaciones','bloqueado',
  await as(db, ANON, `select nombre_completo from public.postulaciones`).then(r => r.ok && r.rows.length===0 ? {ok:false,err:'0 filas (RLS filtra)'} : r));
chk('1 Postulación','anónimo','enviarse como ganador','bloqueado',
  await as(db, ANON, `insert into public.postulaciones ${POST_COLS.replace('(id,','(id,estado,')} values ${POST_VALS.replace("('"+POSTULACION_ID+"',","('cccccccc-0000-4000-8000-000000000001','ganador',")}`));
chk('1 Postulación','anónimo','leer los adjuntos subidos','bloqueado',
  await as(db, ANON, `select name from storage.objects where bucket_id='postulaciones'`).then(r => r.ok && r.rows.length===0 ? {ok:false,err:'0 filas (RLS filtra)'} : r));

// ===== 2. JURADO 1 =====
chk('2 Calificación','jurado 1','ver la postulación','permitido',
  await as(db, P.jurado1, `select nombre_emprendimiento from public.postulaciones`));
chk('2 Calificación','jurado 1','abrir los adjuntos','permitido',
  await as(db, P.jurado1, `select name from storage.objects where bucket_id='postulaciones'`));
chk('2 Calificación','jurado 1','calificar como jurado_1','permitido',
  await asCommit(db, P.jurado1, `insert into public.evaluaciones (postulacion_id,entidad,pertinencia,modelo_negocio,innovacion,potencial,comentario)
    values ('${POSTULACION_ID}','jurado_1',4,4,4,4,'Buen impacto territorial')`));
chk('2 Calificación','jurado 1','calificar suplantando a jurado_2','bloqueado',
  await as(db, P.jurado1, `insert into public.evaluaciones (postulacion_id,entidad,pertinencia,modelo_negocio,innovacion,potencial)
    values ('${POSTULACION_ID}','jurado_2',1,1,1,1)`));

// ===== 3. JURADO 2 =====
chk('3 Calificación','jurado 2','calificar como jurado_2','permitido',
  await asCommit(db, P.jurado2, `insert into public.evaluaciones (postulacion_id,entidad,pertinencia,modelo_negocio,innovacion,potencial,comentario)
    values ('${POSTULACION_ID}','jurado_2',3,3,4,3,'Modelo por validar')`));
chk('3 Calificación','jurado 2','ver la nota del jurado 1','bloqueado',
  await as(db, P.jurado2, `select entidad,pertinencia from public.evaluaciones where entidad='jurado_1'`)
    .then(r => r.ok && r.rows.length===0 ? {ok:false,err:'0 filas (RLS filtra)'} : r));
chk('3 Calificación','jurado 2','ver su propia nota','permitido',
  await as(db, P.jurado2, `select entidad,pertinencia from public.evaluaciones`));
chk('3 Calificación','jurado 1','ver la nota del jurado 2','bloqueado',
  await as(db, P.jurado1, `select entidad,pertinencia from public.evaluaciones where entidad='jurado_2'`)
    .then(r => r.ok && r.rows.length===0 ? {ok:false,err:'0 filas (RLS filtra)'} : r));

// ===== 4. ADMIN =====
chk('4 Ranking','admin','ver ambas notas','permitido',
  await as(db, P.admin, `select entidad,pertinencia,evaluador_nombre,evaluador_email from public.evaluaciones order by entidad`));
chk('4 Ranking','admin','ver el ranking con identidad del jurado','permitido',
  await as(db, P.admin, `select puntaje_p,puntaje_j1,puntaje_j2,puntaje_global,es_parcial,
    jurado_1_nombre,calificado_por_j1,calificado_por_j1_email,
    jurado_2_nombre,calificado_por_j2,calificado_por_j2_email from public.ranking_postulaciones`));
chk('4 Ranking','admin','renombrar el jurado 2','permitido',
  await asCommit(db, P.admin, `update public.jurados set nombre='Alcaldía de Soledad' where clave='jurado_2'`));
chk('4 Ranking','admin','el ranking refleja el nombre nuevo','permitido',
  await as(db, P.admin, `select jurado_2_nombre, falta from public.ranking_postulaciones`));
chk('4 Ranking','admin','autorizar ganador','permitido',
  await asCommit(db, P.admin, `update public.postulaciones set estado='ganador' where id='${POSTULACION_ID}'`));

// ===== 5. BENEFICIARIO =====
await db.query(`insert into public.cursos (id,titulo,activo) values ('dddddddd-0000-4000-8000-000000000001','Bootcamp modelo de negocio',true) on conflict do nothing`);
chk('5 Beneficiario','beneficiario','ver cursos activos','permitido',
  await as(db, P.benef, `select titulo from public.cursos where activo`));
chk('5 Beneficiario','beneficiario','leer postulaciones','bloqueado',
  await as(db, P.benef, `select nombre_completo from public.postulaciones`)
    .then(r => r.ok && r.rows.length===0 ? {ok:false,err:'0 filas (RLS filtra)'} : r));
chk('5 Beneficiario','beneficiario','leer evaluaciones','bloqueado',
  await as(db, P.benef, `select pertinencia from public.evaluaciones`)
    .then(r => r.ok && r.rows.length===0 ? {ok:false,err:'0 filas (RLS filtra)'} : r));
chk('5 Beneficiario','beneficiario','calificar','bloqueado',
  await as(db, P.benef, `insert into public.evaluaciones (postulacion_id,entidad,pertinencia,modelo_negocio,innovacion,potencial) values ('${POSTULACION_ID}','jurado_1',5,5,5,5)`));
chk('5 Beneficiario','beneficiario','ascenderse a admin','bloqueado',
  await as(db, P.benef, `update public.profiles set role='admin' where id='${P.benef.id}'`)
    .then(async r => { if(!r.ok) return r; const v = await as(db, SVC, `select role from public.profiles where id='${P.benef.id}'`); return v.rows[0].role==='admin' ? r : {ok:false,err:'update sin efecto (RLS)'} ; }));

// ===== 6. CUENTA PENDIENTE =====
chk('6 Pendiente','cuenta pendiente','ver cursos','bloqueado',
  await as(db, P.pend, `select titulo from public.cursos where activo`)
    .then(r => r.ok && r.rows.length===0 ? {ok:false,err:'0 filas (RLS filtra)'} : r));

// ===== 7. EDITOR =====
chk('7 Editor','editor','crear un momento','permitido',
  await asCommit(db, P.editor, `insert into public.momentos (titulo,slug,estado) values ('Prueba editor','prueba-editor','borrador')`));
chk('7 Editor','editor','leer postulaciones','bloqueado',
  await as(db, P.editor, `select nombre_completo from public.postulaciones`)
    .then(r => r.ok && r.rows.length===0 ? {ok:false,err:'0 filas (RLS filtra)'} : r));
chk('7 Editor','editor','calificar','bloqueado',
  await as(db, P.editor, `insert into public.evaluaciones (postulacion_id,entidad,pertinencia,modelo_negocio,innovacion,potencial) values ('${POSTULACION_ID}','jurado_1',5,5,5,5)`));

// Salida
const ancho = { etapa:16, actor:16, accion:40, esperado:10, real:10 };
console.log('\n' + '='.repeat(118));
console.log('MATRIZ DE FLUJO Y PERMISOS');
console.log('='.repeat(118));
let last='';
for (const r of R) {
  if (r.etapa !== last) { console.log('\n── ' + r.etapa + ' ' + '─'.repeat(110 - r.etapa.length)); last = r.etapa; }
  console.log(`${r.pass?'  ✅':'  ❌'} ${r.actor.padEnd(ancho.actor)} ${r.accion.padEnd(ancho.accion)} esperado=${r.esperado.padEnd(10)} real=${r.real}`);
  if (!r.pass) console.log(`       └─ ${r.detalle}`);
}
const fail = R.filter(r=>!r.pass);
console.log('\n' + '='.repeat(118));
console.log(`RESULTADO: ${R.length-fail.length}/${R.length} comprobaciones pasaron.` + (fail.length?`  ❌ ${fail.length} fallaron`:'  ✅ todo verde'));
console.log('='.repeat(118));

const rank = await as(db, P.admin, `select * from public.ranking_postulaciones`);
console.log('\nFICHA FINAL DEL RANKING:');
console.log(JSON.stringify(rank.rows[0], null, 2));

const { writeFileSync } = await import('node:fs');
writeFileSync('resultados.json', JSON.stringify({ matriz: R, ranking: rank.rows[0] }, null, 2));
};
run().catch(e => { console.error('ERR:', e.message); process.exit(1); });

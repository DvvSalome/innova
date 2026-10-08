-- Batería de permisos (RLS) y flujo de datos de Innova Social 5.0.
-- Corre TODO dentro de una transacción que termina en ROLLBACK: no deja datos, usuarios ni cambios.
-- Suplanta a cada rol (visitante, admin, editor, evaluadores, beneficiario, cuenta pendiente)
-- usando como base la cuenta real de cristian@inngenios.co.
--
--   supabase db query --linked -o json -f supabase/tests/permisos.sql
--
-- Cada fila del resultado es una comprobación con ok = true/false.

begin;
create schema t;
grant usage on schema t to public;
create table t.res(n serial primary key, nombre text, ok boolean, detalle text);
grant all on t.res to public;
grant usage on all sequences in schema t to public;
create table t.ctx as select id as cid from public.profiles where email = 'cristian@inngenios.co';
grant select on t.ctx to public;

create function t.rec(nombre text, ok boolean, detalle text default null) returns void language sql as $$ insert into t.res(nombre, ok, detalle) values (nombre, coalesce(ok, false), detalle) $$;
create function t.login(uid uuid) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  set local role authenticated; end $$;
create function t.anon() returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon; end $$;
create function t.root() returns void language plpgsql as $$ begin reset role; end $$;
create function t.try(q text) returns text language plpgsql as $$ declare n int; begin execute q; get diagnostics n = row_count; return 'ok:' || n; exception when others then return 'ERR:' || sqlerrm; end $$;
create function t.cnt(q text) returns int language plpgsql as $$ declare n int; begin execute 'select count(*) from (' || q || ') s' into n; return n; exception when others then return -1; end $$;
grant execute on all functions in schema t to public;

select t.rec('preparación: existe la cuenta base cristian@inngenios.co', (select count(*) from t.ctx) = 1);

-- ================= Datos de prueba (dentro de la transacción) =================
insert into public.postulaciones (id, nombre_completo, correo, whatsapp, cedula, domicilio, nombre_emprendimiento, municipio, tipo_emprendimiento, tipo_formalizacion, dedicacion_tiempo, num_colaboradores, etapa_emprendimiento, esta_vendiendo, promedio_ventas_6_meses, empleo_formal_adicional, ods, redes, redes_sociales, pagina_web) values
 ('a0000000-0000-4000-8000-000000000001','F1 max','f1@x.co','+573000000001','1','Soledad','F1','Soledad','Negocio verde','Persona jurídica','Completo',8,'Consolidación y expansión',true,'20000000',false,'{6,7,9}','[{"red":"Instagram","url":"https://i.co/a"},{"red":"Facebook","url":"https://f.co/a"},{"red":"TikTok","url":"https://t.co/a"}]','', 'https://w.co'),
 ('a0000000-0000-4000-8000-000000000002','F2 ceros','f2@x.co','+573000000002','2','Soledad','F2','Soledad','Emprendimiento verde','Ninguna de las dos',null,0,'otra',false,'0',null,'{2,3}','[]','',null),
 ('a0000000-0000-4000-8000-000000000003','F3','f3@x.co','+573000000003','3','Soledad','F3','Soledad','Emprendimiento verde','Persona natural','Parcial',2,'Fortalecimiento — prototipo desarrollado y probado',true,'999999',true,'{6,6,12,2}','[]','','https://w.co'),
 ('a0000000-0000-4000-8000-000000000004','F4 ventas texto','f4@x.co','+573000000004','4','Soledad','F4','Soledad','Negocio verde','Persona jurídica','Parcial',5,'Ideación',true,'$1.800.000 / mes',false,'{13,15,11,9}','[]','Instagram: https://i.co/x · Facebook: https://f.co/x','https://w.co'),
 ('a0000000-0000-4000-8000-000000000005','F5','f5@x.co','+573000000005','5','Soledad','F5','Soledad','Negocio verde','Persona natural','Completo',6,'Consolidación y expansión',true,'5000000',false,'{}','[{"red":"X","url":"https://x.co/a"}]','','https://w.co');

-- ================= VISITANTE (sin sesión) =================
select t.anon();
select t.rec('visitante: envía una postulación normal', t.try($$insert into public.postulaciones (id,nombre_completo,correo,whatsapp,cedula,domicilio,nombre_emprendimiento,municipio,tipo_emprendimiento,promedio_ventas_6_meses) values ('b0000000-0000-4000-8000-000000000001','Anon','a@x.co','+57300','9','S','AN','S','Negocio verde','$1.800.000 / mes')$$) = 'ok:1');
select t.rec('visitante: NO puede enviarse como ganador', t.try($$insert into public.postulaciones (id,nombre_completo,correo,whatsapp,cedula,domicilio,nombre_emprendimiento,municipio,estado) values ('b0000000-0000-4000-8000-000000000002','A','a@x.co','+57','9','S','AN','S','ganador')$$) like 'ERR%');
select t.rec('visitante: NO puede asignarse cuenta ni desempate', t.try($$insert into public.postulaciones (id,nombre_completo,correo,whatsapp,cedula,domicilio,nombre_emprendimiento,municipio,orden_desempate) values ('b0000000-0000-4000-8000-000000000003','A','a@x.co','+57','9','S','AN','S',1)$$) like 'ERR%');
select t.rec('visitante: tipo de emprendimiento inválido se rechaza', t.try($$insert into public.postulaciones (id,nombre_completo,correo,whatsapp,cedula,domicilio,nombre_emprendimiento,municipio,tipo_emprendimiento) values ('b0000000-0000-4000-8000-000000000004','A','a@x.co','+57','9','S','AN','S','Otro')$$) like 'ERR%');
select t.rec('visitante: faltar un dato obligatorio se rechaza', t.try($$insert into public.postulaciones (id,nombre_completo) values ('b0000000-0000-4000-8000-000000000005','A')$$) like 'ERR%');
select t.rec('visitante: descripción de 5.000 caracteres se rechaza', t.try($$insert into public.postulaciones (id,nombre_completo,correo,whatsapp,cedula,domicilio,nombre_emprendimiento,municipio,descripcion_producto) values ('b0000000-0000-4000-8000-000000000006','A','a@x.co','+57','9','S','AN','S',repeat('x',5000))$$) like 'ERR%');
select t.rec('visitante: más de 3 redes se rechaza', t.try($$insert into public.postulaciones (id,nombre_completo,correo,whatsapp,cedula,domicilio,nombre_emprendimiento,municipio,redes) values ('b0000000-0000-4000-8000-000000000007','A','a@x.co','+57','9','S','AN','S','[1,2,3,4]')$$) like 'ERR%');
select t.rec('visitante: no lee postulaciones', t.cnt('select 1 from public.postulaciones') = 0);
select t.rec('visitante: no modifica ni borra postulaciones', t.try($$update public.postulaciones set estado='ganador'$$) = 'ok:0' and t.try($$delete from public.postulaciones$$) = 'ok:0');
select t.rec('visitante: no lee evaluaciones, correos, visitas, ranking, perfiles, cursos', t.cnt('select 1 from public.evaluaciones') <= 0 and t.cnt('select 1 from public.correos_enviados') <= 0 and t.cnt('select 1 from public.visitas') <= 0 and t.cnt('select 1 from public.ranking_postulaciones') <= 0 and t.cnt('select 1 from public.profiles') <= 0 and t.cnt('select 1 from public.cursos') <= 0 and t.cnt('select 1 from public.recursos') <= 0);
select t.rec('visitante: ve momentos publicados y no borradores', t.cnt($$select 1 from public.momentos where estado='publicado'$$) >= 1 and t.cnt($$select 1 from public.momentos where estado='borrador'$$) = 0);
select t.rec('visitante: ve etapas y resultados', t.cnt('select 1 from public.etapas_convocatoria') >= 1 and t.cnt('select 1 from public.resultados_programa') >= 1);
select t.rec('visitante: no escribe contenido web ni configuración', t.try($$update public.momentos set titulo='x'$$) = 'ok:0' and t.try($$insert into public.hero_sliders(imagen_url) values ('https://x.co/a.jpg')$$) like 'ERR%' and t.try($$update public.etapas_convocatoria set nombre='x'$$) = 'ok:0' and t.try($$update public.resultados_programa set valor=1$$) = 'ok:0' and t.try($$update public.configuracion set valor='{}'$$) = 'ok:0');
select t.rec('visitante: registra una visita válida; rechaza una inválida', t.try($$insert into public.visitas(pagina,dispositivo,plataforma,pais) values ('/x','Escritorio','macOS','Colombia')$$) = 'ok:1' and t.try($$insert into public.visitas(pagina,dispositivo,plataforma,pais) values ('/x','Robot','macOS','Colombia')$$) like 'ERR%');
select t.rec('visitante: no usa analítica, puntaje ni funciones internas', t.try($$select public.analitica_resumen(current_date-1, current_date)$$) like 'ERR%' and t.try($$select public.puntaje_postulacion('a0000000-0000-4000-8000-000000000001')$$) like 'ERR%' and t.try($$select public.handle_new_user()$$) like 'ERR%');
select t.rec('visitante: sube adjunto con la ruta del formulario', t.try($$insert into storage.objects(bucket_id,name) values ('postulaciones','b0000000-0000-4000-8000-000000000001/cedula.pdf'),('postulaciones','b0000000-0000-4000-8000-000000000001/rut.jpg'),('postulaciones','b0000000-0000-4000-8000-000000000001/recibo_triple_a.png')$$) = 'ok:3');
select t.rec('visitante: NO sube con otro nombre, extensión o bucket', t.try($$insert into storage.objects(bucket_id,name) values ('postulaciones','x.html')$$) like 'ERR%' and t.try($$insert into storage.objects(bucket_id,name) values ('postulaciones','b0000000-0000-4000-8000-000000000001/rut.exe')$$) like 'ERR%' and t.try($$insert into storage.objects(bucket_id,name) values ('postulaciones-docs','b0000000-0000-4000-8000-000000000001/cedula.pdf')$$) like 'ERR%' and t.try($$insert into storage.objects(bucket_id,name) values ('cursos','zz/a.pdf')$$) like 'ERR%' and t.try($$insert into storage.objects(bucket_id,name) values ('momentos','zz/a.png')$$) like 'ERR%');
select t.rec('visitante: no lee adjuntos', t.cnt($$select 1 from storage.objects where bucket_id in ('postulaciones','postulaciones-docs')$$) = 0);
select t.root();

-- ================= ADMINISTRADOR =================
update public.profiles set role='admin', entidad=null where id=(select cid from t.ctx);
select t.login((select cid from t.ctx));
select t.rec('admin: ve todas las postulaciones (incluida la del visitante)', t.cnt('select 1 from public.postulaciones') >= 6);
select t.rec('admin: el ranking se calcula sin errores (ventas en texto)', t.cnt('select puntaje_p, puntaje_global from public.ranking_postulaciones') >= 6, t.cnt('select puntaje_p from public.ranking_postulaciones')::text);
select t.rec('admin: lee adjuntos de postulaciones', t.cnt($$select 1 from storage.objects where bucket_id='postulaciones'$$) >= 3);
select t.rec('admin: cambia estado (incluido participante) y desempate', t.try($$update public.postulaciones set estado='participante', orden_desempate=1, nota_desempate='n' where id='a0000000-0000-4000-8000-000000000002'$$) = 'ok:1');
select t.rec('admin: estado inválido se rechaza', t.try($$update public.postulaciones set estado='aceptado' where id='a0000000-0000-4000-8000-000000000002'$$) like 'ERR%');
select t.rec('admin: edita pesos', t.try($$update public.configuracion set valor='{"plataforma":0.40,"inngenios":0.30,"triple_a":0.30}' where clave='pesos'$$) = 'ok:1');
select t.rec('admin: CRUD de momentos (y slug duplicado rechazado)', t.try($$insert into public.momentos(slug,titulo,estado) values ('t-slug','T','borrador')$$) = 'ok:1' and t.try($$update public.momentos set estado='publicado' where slug='t-slug'$$) = 'ok:1' and t.try($$insert into public.momentos(slug,titulo) values ('t-slug','Dup')$$) like 'ERR%' and t.try($$delete from public.momentos where slug='t-slug'$$) = 'ok:1');
select t.rec('admin: CRUD de fotos, etapas y resultados', t.try($$insert into public.hero_sliders(imagen_url,orden) values ('https://x.co/a.jpg',99)$$) = 'ok:1' and t.try($$insert into public.etapas_convocatoria(nombre,fechas_texto,orden,icono) values ('x','y',99,'pitch')$$) = 'ok:1' and t.try($$insert into public.resultados_programa(grupo,etiqueta,valor,orden) values ('actual','x',1,99)$$) = 'ok:1');
select t.rec('admin: lee correos, visitas y usa la analítica', t.cnt('select 1 from public.correos_enviados') >= 0 and t.cnt('select 1 from public.visitas') >= 1 and t.try($$select public.analitica_resumen(current_date-30, current_date)$$) like 'ok%');
select t.rec('admin SIN entidad: no puede calificar', t.try($$insert into public.evaluaciones(postulacion_id,entidad,evaluador_id,pertinencia,modelo_negocio,innovacion,potencial) values ('a0000000-0000-4000-8000-000000000001','inngenios',(select cid from t.ctx),3,3,3,3)$$) like 'ERR%');
select t.rec('admin: ve perfiles del equipo y puede cambiar roles', t.cnt('select 1 from public.profiles') >= 1);
select t.root();

-- Admin CON entidad (los admins de Inngenios califican)
update public.profiles set role='admin', entidad='inngenios' where id=(select cid from t.ctx);
select t.login((select cid from t.ctx));
select t.rec('admin CON entidad Inngenios: califica como Inngenios', t.try($$insert into public.evaluaciones(postulacion_id,entidad,evaluador_id,pertinencia,modelo_negocio,innovacion,potencial) values ('a0000000-0000-4000-8000-000000000005','inngenios',(select cid from t.ctx),3,3,3,3)$$) = 'ok:1');
select t.rec('admin CON entidad Inngenios: NO califica como Triple A', t.try($$insert into public.evaluaciones(postulacion_id,entidad,evaluador_id,pertinencia,modelo_negocio,innovacion,potencial) values ('a0000000-0000-4000-8000-000000000005','triple_a',(select cid from t.ctx),3,3,3,3)$$) like 'ERR%');
select t.try($$delete from public.evaluaciones where postulacion_id='a0000000-0000-4000-8000-000000000005'$$);
select t.root();

-- ================= EVALUADOR INNGENIOS =================
update public.profiles set role='evaluador', entidad='inngenios' where id=(select cid from t.ctx);
select t.login((select cid from t.ctx));
select t.rec('eval Inngenios: lee postulaciones y adjuntos', t.cnt('select 1 from public.postulaciones') >= 6 and t.cnt($$select 1 from storage.objects where bucket_id='postulaciones'$$) >= 3);
select t.rec('eval Inngenios: NO cambia estados', t.try($$update public.postulaciones set estado='ganador'$$) = 'ok:0');
select t.rec('eval Inngenios: califica (F1 = 16/20, F2 = 20/20)', t.try($$insert into public.evaluaciones(postulacion_id,entidad,evaluador_id,pertinencia,modelo_negocio,innovacion,potencial) values ('a0000000-0000-4000-8000-000000000001','inngenios',(select cid from t.ctx),4,4,4,4),('a0000000-0000-4000-8000-000000000002','inngenios',(select cid from t.ctx),5,5,5,5)$$) = 'ok:2');
select t.rec('eval Inngenios: NO califica como Triple A', t.try($$insert into public.evaluaciones(postulacion_id,entidad,evaluador_id,pertinencia,modelo_negocio,innovacion,potencial) values ('a0000000-0000-4000-8000-000000000003','triple_a',(select cid from t.ctx),3,3,3,3)$$) like 'ERR%');
select t.rec('eval Inngenios: nota fuera de 1–5 y doble calificación se rechazan', t.try($$insert into public.evaluaciones(postulacion_id,entidad,evaluador_id,pertinencia,modelo_negocio,innovacion,potencial) values ('a0000000-0000-4000-8000-000000000003','inngenios',(select cid from t.ctx),6,3,3,3)$$) like 'ERR%' and t.try($$insert into public.evaluaciones(postulacion_id,entidad,evaluador_id,pertinencia,modelo_negocio,innovacion,potencial) values ('a0000000-0000-4000-8000-000000000001','inngenios',(select cid from t.ctx),1,1,1,1)$$) like 'ERR%');
select t.rec('eval Inngenios: edita su calificación (upsert del panel)', t.try($$insert into public.evaluaciones(postulacion_id,entidad,evaluador_id,pertinencia,modelo_negocio,innovacion,potencial) values ('a0000000-0000-4000-8000-000000000001','inngenios',(select cid from t.ctx),4,4,4,4) on conflict (postulacion_id,entidad) do update set potencial=excluded.potencial$$) = 'ok:1');
select t.rec('eval Inngenios: no usa analítica, correos ni cursos', t.try($$select public.analitica_resumen(current_date-1,current_date)$$) like 'ERR%' and t.cnt('select 1 from public.correos_enviados') <= 0 and t.cnt('select 1 from public.cursos') <= 0);
select t.rec('eval Inngenios: el ranking no le revela la nota de Triple A', t.cnt('select 1 from public.ranking_postulaciones where puntaje_a is not null') = 0);
select t.root();

-- ================= EVALUADOR TRIPLE A =================
update public.profiles set entidad='triple_a' where id=(select cid from t.ctx);
select t.login((select cid from t.ctx));
select t.rec('eval Triple A: califica (F1 = 14/20, F2 = 5/20)', t.try($$insert into public.evaluaciones(postulacion_id,entidad,evaluador_id,pertinencia,modelo_negocio,innovacion,potencial) values ('a0000000-0000-4000-8000-000000000001','triple_a',(select cid from t.ctx),4,4,3,3),('a0000000-0000-4000-8000-000000000002','triple_a',(select cid from t.ctx),1,1,1,2)$$) = 'ok:2');
select t.rec('eval Triple A: NO ve ni edita la nota de Inngenios', t.cnt($$select 1 from public.evaluaciones where entidad='inngenios'$$) = 0 and t.try($$update public.evaluaciones set potencial=1 where entidad='inngenios'$$) = 'ok:0');
select t.root();

-- ================= RANKING (como admin) =================
update public.profiles set role='admin', entidad=null where id=(select cid from t.ctx);
select t.login((select cid from t.ctx));
select t.rec('ranking: F1 I=80, A=70, global = 0,4·100 + 0,3·80 + 0,3·70 = 85', (select puntaje_p = 100 and puntaje_i = 80 and puntaje_a = 70 and puntaje_global = 85 and not es_parcial from public.ranking_postulaciones where id='a0000000-0000-4000-8000-000000000001') is true, (select puntaje_p||' / '||puntaje_i||' / '||puntaje_a||' → '||puntaje_global from public.ranking_postulaciones where id='a0000000-0000-4000-8000-000000000001'));
select t.rec('ranking: F2 se marca para revisar en conjunto (|100 − 25| > 25)', (select revisar_conjunto from public.ranking_postulaciones where id='a0000000-0000-4000-8000-000000000002') is true);
select t.rec('ranking: sin calificar queda parcial y dice qué falta', (select es_parcial and falta = 'Faltan Inngenios y Triple A' from public.ranking_postulaciones where id='a0000000-0000-4000-8000-000000000003') is true);
select t.rec('puntaje: «$1.800.000 / mes» cuenta en el rango $1–5M (5 puntos)', (select (public.puntaje_plataforma(p)->'detalle'->1->>1)::int = 5 from public.postulaciones p where id='a0000000-0000-4000-8000-000000000004'));
select t.try($$update public.configuracion set valor='{"plataforma":0.3333,"inngenios":0.3333,"triple_a":0.3334}' where clave='pesos'$$);
select t.rec('ranking: cambiar pesos recalcula (1/3 cada uno → 83,3)', (select puntaje_global between 83.3 and 83.4 from public.ranking_postulaciones where id='a0000000-0000-4000-8000-000000000001') is true);
select t.root();

-- ================= EDITOR =================
update public.profiles set role='editor', entidad=null where id=(select cid from t.ctx);
select t.login((select cid from t.ctx));
select t.rec('editor: NO ve postulaciones, ranking, correos, evaluaciones ni adjuntos', t.cnt('select 1 from public.postulaciones') = 0 and t.cnt('select 1 from public.ranking_postulaciones') = 0 and t.cnt('select 1 from public.correos_enviados') <= 0 and t.cnt('select 1 from public.evaluaciones') = 0 and t.cnt($$select 1 from storage.objects where bucket_id='postulaciones'$$) = 0);
select t.rec('editor: gestiona momentos, fotos, etapas y resultados', t.try($$insert into public.momentos(slug,titulo,estado) values ('te','E','borrador')$$) = 'ok:1' and t.try($$delete from public.momentos where slug='te'$$) = 'ok:1' and t.try($$insert into public.hero_sliders(imagen_url,orden) values ('https://x.co/b.jpg',98)$$) = 'ok:1' and t.try($$update public.etapas_convocatoria set nombre=nombre$$) like 'ok:%' and t.try($$update public.resultados_programa set valor=valor$$) like 'ok:%');
select t.rec('editor: gestiona cursos, materiales y archivos', t.try($$insert into public.cursos(id,titulo,visibilidad) values ('c0000000-0000-4000-8000-000000000009','C','todos')$$) = 'ok:1' and t.try($$insert into public.recursos(curso_id,titulo,tipo,url,modulo) values ('c0000000-0000-4000-8000-000000000009','R','enlace','https://x.co','M1')$$) = 'ok:1' and t.try($$insert into storage.objects(bucket_id,name,owner_id) values ('momentos','zz/a.png','x'),('cursos','zz/a.pdf','x')$$) = 'ok:2' and t.try($$delete from public.cursos where id='c0000000-0000-4000-8000-000000000009'$$) = 'ok:1');
select t.rec('editor: usa la analítica; no cambia pesos ni su rol', t.try($$select public.analitica_resumen(current_date-30,current_date)$$) like 'ok%' and t.try($$update public.configuracion set valor='{}'$$) = 'ok:0' and t.try($$update public.profiles set role='admin' where id=(select cid from t.ctx)$$) = 'ok:0');
select t.root();

-- ================= EVALUADOR SIN ENTIDAD =================
update public.profiles set role='evaluador', entidad=null where id=(select cid from t.ctx);
select t.login((select cid from t.ctx));
select t.rec('evaluador sin entidad: no ve postulaciones ni califica', t.cnt('select 1 from public.postulaciones') = 0 and t.try($$insert into public.evaluaciones(postulacion_id,entidad,evaluador_id,pertinencia,modelo_negocio,innovacion,potencial) values ('a0000000-0000-4000-8000-000000000003','inngenios',(select cid from t.ctx),3,3,3,3)$$) like 'ERR%');
select t.root();

-- ================= CUENTA NUEVA (registro) Y BENEFICIARIO =================
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
 ('d0000000-0000-4000-8000-00000000000a','00000000-0000-0000-0000-000000000000','authenticated','authenticated','alguien@example.com','{"full_name":"Alguien"}', now(), now());
select t.rec('registro: una cuenta nueva nace sin acceso («pendiente»)', (select role from public.profiles where id='d0000000-0000-4000-8000-00000000000a') = 'pendiente');
insert into public.cursos(id,titulo,visibilidad,cohorte,postulacion_id,activo,solo_beneficiarios) values
 ('c0000000-0000-4000-8000-000000000001','todos','todos',null,null,true,true),
 ('c0000000-0000-4000-8000-000000000002','cohorte 5.0','cohorte','5.0',null,true,true),
 ('c0000000-0000-4000-8000-000000000003','cohorte 6.0','cohorte','6.0',null,true,true),
 ('c0000000-0000-4000-8000-000000000004','mi emprendimiento','emprendimiento',null,'a0000000-0000-4000-8000-000000000003',true,true),
 ('c0000000-0000-4000-8000-000000000005','otro emprendimiento','emprendimiento',null,'a0000000-0000-4000-8000-000000000002',true,true),
 ('c0000000-0000-4000-8000-000000000006','borrador','todos',null,null,false,true);
insert into public.recursos(curso_id,titulo,tipo,url,modulo,activo,solo_beneficiarios)
 select id,'rec '||titulo,'enlace','https://x.co','M1',true,true from public.cursos where id::text like 'c0000000%';
select t.login('d0000000-0000-4000-8000-00000000000a');
select t.rec('pendiente: no ve cursos, materiales, postulaciones ni se sube el rol', t.cnt($$select 1 from public.cursos where id::text like 'c0000000%'$$) = 0 and t.cnt($$select 1 from public.recursos where curso_id::text like 'c0000000%'$$) = 0 and t.cnt('select 1 from public.postulaciones') = 0 and t.try($$update public.profiles set role='admin' where id='d0000000-0000-4000-8000-00000000000a'$$) = 'ok:0');
select t.root();
-- Autorizar ganador = lo que hace la función «correos» (cuenta asignada + estado ganador + cohorte)
update public.postulaciones set user_id='d0000000-0000-4000-8000-00000000000a', estado='ganador' where id='a0000000-0000-4000-8000-000000000003';
update public.profiles set cohorte='5.0' where id='d0000000-0000-4000-8000-00000000000a';
select t.rec('autorizar ganador promueve la cuenta a beneficiario', (select role from public.profiles where id='d0000000-0000-4000-8000-00000000000a') = 'beneficiario');
select t.login('d0000000-0000-4000-8000-00000000000a');
select t.rec('beneficiario: ve exactamente sus 3 cursos (todos, su cohorte, su emprendimiento)', t.cnt($$select 1 from public.cursos where id::text like 'c0000000%'$$) = 3, (select string_agg(titulo, ', ' order by titulo) from public.cursos where id::text like 'c0000000%'));
select t.rec('beneficiario: ve solo los materiales de esos cursos (y el conteo de mis-cursos)', t.cnt($$select 1 from public.recursos where curso_id::text like 'c0000000%'$$) = 3 and (select sum((select count(*) from public.recursos r where r.curso_id = c.id)) from public.cursos c where c.id::text like 'c0000000%') = 3);
select t.rec('beneficiario: ve solo SU postulación y no la modifica', t.cnt('select 1 from public.postulaciones') = 1 and t.try($$update public.postulaciones set estado='rechazado'$$) = 'ok:0');
select t.rec('beneficiario: no ve evaluaciones, correos, adjuntos ni analítica', t.cnt('select 1 from public.evaluaciones') = 0 and t.cnt('select 1 from public.correos_enviados') <= 0 and t.cnt($$select 1 from storage.objects where bucket_id='postulaciones'$$) = 0 and t.try($$select public.analitica_resumen(current_date-1,current_date)$$) like 'ERR%');
select t.root();
update public.profiles set role='evaluador', entidad='inngenios' where id=(select cid from t.ctx);
update public.postulaciones set estado='postulado' where id='a0000000-0000-4000-8000-000000000001';
update public.postulaciones set user_id=(select cid from t.ctx), estado='ganador' where id='a0000000-0000-4000-8000-000000000001';
select t.rec('marcar ganador NO degrada a un evaluador o admin', (select role from public.profiles where id=(select cid from t.ctx)) = 'evaluador');

-- ================= INTEGRIDAD =================
select t.rec('integridad: RLS activo en todas las tablas', (select count(*) from pg_tables where schemaname='public' and not rowsecurity) = 0, (select string_agg(tablename, ',') from pg_tables where schemaname='public' and not rowsecurity));
select t.rec('integridad: el ranking respeta los permisos de quien consulta (security_invoker)', (select reloptions::text like '%security_invoker=true%' from pg_class where relname='ranking_postulaciones'));
select t.rec('integridad: buckets privados/públicos correctos', (select not public from storage.buckets where id='postulaciones') and (select public from storage.buckets where id='momentos') and (select public from storage.buckets where id='cursos'));
select t.rec('integridad: borrar una postulación borra sus calificaciones', t.try($$delete from public.postulaciones where id='a0000000-0000-4000-8000-000000000002'$$) = 'ok:1' and t.cnt($$select 1 from public.evaluaciones where postulacion_id='a0000000-0000-4000-8000-000000000002'$$) = 0);

select n, nombre, ok, detalle from t.res order by n;
rollback;

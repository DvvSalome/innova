-- ============================================================================
-- Innova Social — dos migraciones en un solo archivo
--
--   1. Corrección del ranking (20261005120000_puntaje_ventas_texto)
--   2. Jurados configurables + identidad del calificador (20261009120000)
--
-- Pegar COMPLETO en Supabase → SQL Editor del proyecto yivyqorgcagwykedngjv
-- y ejecutar. Va dentro de una transacción: entra todo o no entra nada.
--
-- NO borra datos. La limpieza de datos de prueba y adjuntos huérfanos sigue
-- aparte, en APLICAR-EN-PRODUCCION.sql (bloque 3), para no mezclar un DELETE
-- dentro de un archivo de migraciones.
--
-- Se puede volver a ejecutar sin daño: todo es create or replace / if exists.
-- ============================================================================

begin;

-- ===========================================================================
-- PARTE 1 · El ranking está caído
--
-- puntaje_plataforma() asigna promedio_ventas_6_meses (columna `text`) a una
-- variable numeric y revienta con 22P02 ante "$1.800.000 / mes". Como la vista
-- llama a la función por fila, UNA postulación mala tumba ranking_postulaciones
-- entera y el panel pierde las notas de los jurados y el puntaje global de TODAS.
-- ===========================================================================

create or replace function public.ventas_a_numero(v text)
returns numeric language sql immutable set search_path = public as $fn$
  select case
    when v is null then null
    -- "1.800.000" y "1,800,000" son separadores de miles: se quitan con el resto.
    when regexp_replace(v, '[^0-9]', '', 'g') = '' then null
    else regexp_replace(v, '[^0-9]', '', 'g')::numeric
  end;
$fn$;

comment on function public.ventas_a_numero(text) is
  'Saca el valor numerico de un texto de ventas en COP ("$1.800.000 / mes" -> 1800000). Devuelve null si no hay digitos.';

create or replace function public.puntaje_plataforma(p public.postulaciones)
returns jsonb language plpgsql stable set search_path = public as $fn$
declare
  d jsonb := '[]'::jsonb; pts int := 0; mx int := 0; x int; v numeric; c int; nredes int := 0; nods int;
begin
  x := case when p.esta_vendiendo then 10 else 0 end;
  d := d || jsonb_build_array(jsonb_build_array('¿Está vendiendo?', x, 10)); pts := pts + x; mx := mx + 10;

  -- ÚNICO cambio de lógica: antes era `v := p.promedio_ventas_6_meses;`
  v := public.ventas_a_numero(p.promedio_ventas_6_meses);
  x := case when v is null or v <= 0 then 0 when v < 1000000 then 2 when v < 5000000 then 5 when v < 15000000 then 8 else 10 end;
  d := d || jsonb_build_array(jsonb_build_array('Promedio de ventas', x, 10)); pts := pts + x; mx := mx + 10;

  x := case when p.etapa_emprendimiento ilike 'Ideaci%' then 3
            when p.etapa_emprendimiento ilike 'Fortalec%' then 7
            when p.etapa_emprendimiento ilike 'Consolid%' then 10 else 0 end;
  d := d || jsonb_build_array(jsonb_build_array('Etapa', x, 10)); pts := pts + x; mx := mx + 10;

  c := p.num_colaboradores;
  x := case when c is null or c < 1 then 0 when c <= 2 then 4 when c <= 5 then 7 else 10 end;
  d := d || jsonb_build_array(jsonb_build_array('Colaboradores', x, 10)); pts := pts + x; mx := mx + 10;

  x := case when p.tipo_formalizacion ilike '%jur_dica%' then 8 when p.tipo_formalizacion ilike '%natural%' then 5 else 0 end;
  d := d || jsonb_build_array(jsonb_build_array('Formalización', x, 8)); pts := pts + x; mx := mx + 8;

  x := case when p.dedicacion_tiempo = 'Completo' then 6 when p.dedicacion_tiempo = 'Parcial' then 3 else 0 end;
  d := d || jsonb_build_array(jsonb_build_array('Dedicación', x, 6)); pts := pts + x; mx := mx + 6;

  x := case when p.empleo_formal_adicional is false then 6 when p.empleo_formal_adicional is true then 2 else 0 end;
  d := d || jsonb_build_array(jsonb_build_array('Empleo formal adicional', x, 6)); pts := pts + x; mx := mx + 6;

  x := case when lower(p.tipo_emprendimiento) = 'negocio verde' then 6 when lower(p.tipo_emprendimiento) = 'emprendimiento verde' then 3 else 0 end;
  d := d || jsonb_build_array(jsonb_build_array('Tipo de emprendimiento', x, 6)); pts := pts + x; mx := mx + 6;

  select count(*) into nods from (select distinct o from unnest(coalesce(p.ods, '{}')) as o where o in (6, 7, 9, 11, 12, 13, 15)) s;
  x := least(nods, 3) * 3;
  d := d || jsonb_build_array(jsonb_build_array('ODS prioritarios', x, 9)); pts := pts + x; mx := mx + 9;

  if jsonb_typeof(p.redes) = 'array' then nredes := jsonb_array_length(p.redes); end if;
  if nredes = 0 and coalesce(p.redes_sociales, '') <> '' then nredes := coalesce(array_length(string_to_array(p.redes_sociales, ' · '), 1), 0); end if;
  nredes := least(nredes, 3);
  x := nredes * 2;
  d := d || jsonb_build_array(jsonb_build_array('Redes sociales', x, 6)); pts := pts + x; mx := mx + 6;

  x := case when coalesce(p.pagina_web, '') <> '' and nredes > 0 then 2 else 0 end;
  d := d || jsonb_build_array(jsonb_build_array('Página web', x, 2)); pts := pts + x; mx := mx + 2;

  return jsonb_build_object('pts', pts, 'max', mx, 'P', round(pts::numeric / mx * 100, 1), 'detalle', d);
end;
$fn$;

-- El bucket `postulaciones-docs` quedó de un diseño anterior: la aplicación sube
-- y lee todo en `postulaciones`. Su política de INSERT no pide sesión ni valida
-- la ruta, así que con la llave anon (pública, va dentro de postular.html)
-- cualquiera puede llenarlo de archivos que nadie ve. Está vacío; se cierra.
drop policy if exists "Anyone can upload postulacion docs" on storage.objects;

-- ===========================================================================
-- PARTE 2 · Jurados configurables + identidad de quien califica
--
-- Antes el evaluador estaba cableado a 'inngenios' y 'triple_a', repetidos en
-- un check de profiles, otro de evaluaciones, la vista del ranking y la función
-- de correos: reusar la plataforma obligaba a tocar SQL en cuatro sitios.
--
-- Ahora los jurados son filas. La clave ('jurado_1') es estable y es lo que
-- guardan las evaluaciones; el nombre visible ('Triple A', 'Alcaldía de X') lo
-- edita un admin desde el panel.
--
-- Además cada calificación guarda nombre y correo de quien la puso, copiados
-- al calificar: si esa persona sale del equipo y se borra su cuenta, el acta
-- de quién calificó qué no se pierde.
-- ===========================================================================

create table if not exists public.jurados (
  clave text primary key,
  nombre text not null,
  orden int not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.jurados is
  'Entidades que califican. La clave es estable y la guardan las evaluaciones; el nombre es la etiqueta visible y se puede renombrar por convocatoria.';
comment on column public.jurados.orden is
  'Posición en el ranking: 1 -> puntaje_j1, 2 -> puntaje_j2. Hoy el modelo de puntaje asume exactamente dos.';

drop trigger if exists jurados_set_updated_at on public.jurados;
create trigger jurados_set_updated_at
  before update on public.jurados
  for each row execute function public.set_updated_at();

-- Arranca con los dos de la edición 5.0, con el nombre que ya usaba el panel.
insert into public.jurados (clave, nombre, orden) values
  ('jurado_1', 'Inngenios', 1),
  ('jurado_2', 'Triple A', 2)
on conflict (clave) do nothing;

alter table public.jurados enable row level security;

drop policy if exists "Equipo lee jurados" on public.jurados;
create policy "Equipo lee jurados"
  on public.jurados for select to authenticated using (true);

drop policy if exists "Admin administra jurados" on public.jurados;
create policy "Admin administra jurados"
  on public.jurados for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Migrar los valores viejos y repuntar los checks a la tabla.
--
-- Los checks se buscan por definición y no por nombre: si en producción el
-- constraint quedó con otro nombre, un drop por nombre fallaría en silencio y
-- la clave nueva ('jurado_1') chocaría contra el check viejo.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tabla, c.conname
      from pg_constraint c
     where c.contype = 'c'
       and c.conrelid in ('public.profiles'::regclass, 'public.evaluaciones'::regclass)
       and pg_get_constraintdef(c.oid) ilike '%entidad%'
  loop
    execute format('alter table %s drop constraint %I', r.tabla, r.conname);
    raise notice 'check eliminado: %.%', r.tabla, r.conname;
  end loop;
end $$;

update public.profiles     set entidad = 'jurado_1' where entidad = 'inngenios';
update public.profiles     set entidad = 'jurado_2' where entidad = 'triple_a';
update public.evaluaciones set entidad = 'jurado_1' where entidad = 'inngenios';
update public.evaluaciones set entidad = 'jurado_2' where entidad = 'triple_a';

alter table public.profiles drop constraint if exists profiles_entidad_fk;
alter table public.profiles
  add constraint profiles_entidad_fk
  foreign key (entidad) references public.jurados (clave) on update cascade;

alter table public.evaluaciones drop constraint if exists evaluaciones_entidad_fk;
alter table public.evaluaciones
  add constraint evaluaciones_entidad_fk
  foreign key (entidad) references public.jurados (clave) on update cascade;

comment on column public.profiles.entidad is
  'Jurado al que pertenece quien califica (public.jurados.clave). Obligatoria en evaluadores; opcional en admin.';

-- ---------------------------------------------------------------------------
-- Identidad del calificador, congelada al momento de calificar.
-- ---------------------------------------------------------------------------
alter table public.evaluaciones
  add column if not exists evaluador_email text,
  add column if not exists evaluador_nombre text;

comment on column public.evaluaciones.evaluador_email is
  'Correo de quien calificó, copiado al calificar. Sobrevive al borrado de la cuenta (evaluador_id queda null).';

-- Rellena la identidad en cada insert/update para que no dependa del cliente:
-- un evaluador podría omitirla o mandar la de otro.
create or replace function public.sellar_evaluador()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  new.evaluador_id := auth.uid();
  select u.email, coalesce(p.full_name, u.email)
    into new.evaluador_email, new.evaluador_nombre
    from auth.users u
    left join public.profiles p on p.id = u.id
   where u.id = auth.uid();
  return new;
end;
$fn$;

drop trigger if exists evaluaciones_sellar_evaluador on public.evaluaciones;
create trigger evaluaciones_sellar_evaluador
  before insert or update on public.evaluaciones
  for each row execute function public.sellar_evaluador();

-- ---------------------------------------------------------------------------
-- Pesos: pasa {inngenios, triple_a} a {jurado_1, jurado_2} conservando valores.
-- ---------------------------------------------------------------------------
insert into public.configuracion (clave, valor)
values ('pesos', '{"plataforma": 0.40, "jurado_1": 0.30, "jurado_2": 0.30}'::jsonb)
on conflict (clave) do update set valor =
  case
    when public.configuracion.valor ? 'inngenios'
    then jsonb_build_object(
      'plataforma', coalesce(public.configuracion.valor -> 'plataforma', '0.40'::jsonb),
      'jurado_1',   coalesce(public.configuracion.valor -> 'inngenios',  '0.30'::jsonb),
      'jurado_2',   coalesce(public.configuracion.valor -> 'triple_a',   '0.30'::jsonb))
    else public.configuracion.valor
  end;

-- ---------------------------------------------------------------------------
-- Ranking sin nombres cableados: j1/j2 salen de jurados.orden.
-- ---------------------------------------------------------------------------
drop view if exists public.ranking_postulaciones;
create view public.ranking_postulaciones with (security_invoker = true) as
with j as (
  select max(case when orden = 1 then clave end) as c1,
         max(case when orden = 2 then clave end) as c2
  from public.jurados
),
ev as (
  select e.postulacion_id,
         max(case when e.entidad = j.c1 then e.pertinencia + e.modelo_negocio + e.innovacion + e.potencial end) as suma_1,
         max(case when e.entidad = j.c2 then e.pertinencia + e.modelo_negocio + e.innovacion + e.potencial end) as suma_2,
         max(case when e.entidad = j.c1 then e.evaluador_nombre end) as nombre_1,
         max(case when e.entidad = j.c2 then e.evaluador_nombre end) as nombre_2,
         max(case when e.entidad = j.c1 then e.evaluador_email end)  as email_1,
         max(case when e.entidad = j.c2 then e.evaluador_email end)  as email_2,
         max(case when e.entidad = j.c1 then e.updated_at end) as fecha_1,
         max(case when e.entidad = j.c2 then e.updated_at end) as fecha_2
  from public.evaluaciones e cross join j
  group by e.postulacion_id
),
w as (
  select coalesce((select valor from public.configuracion where clave = 'pesos'),
                  '{"plataforma": 0.40, "jurado_1": 0.30, "jurado_2": 0.30}'::jsonb) as pesos
),
base as (
  select p.id, p.created_at, p.estado, p.orden_desempate, p.nota_desempate,
         public.puntaje_plataforma(p) as detalle_p,
         round(ev.suma_1::numeric / 20 * 100, 1) as puntaje_j1,
         round(ev.suma_2::numeric / 20 * 100, 1) as puntaje_j2,
         ev.nombre_1, ev.nombre_2, ev.email_1, ev.email_2, ev.fecha_1, ev.fecha_2,
         w.pesos,
         (select nombre from public.jurados where orden = 1) as jurado_1_nombre,
         (select nombre from public.jurados where orden = 2) as jurado_2_nombre
  from public.postulaciones p
  left join ev on ev.postulacion_id = p.id
  cross join w
)
select id, created_at, estado, orden_desempate, nota_desempate,
       (detalle_p ->> 'P')::numeric as puntaje_p,
       detalle_p,
       puntaje_j1, puntaje_j2,
       jurado_1_nombre, jurado_2_nombre,
       nombre_1 as calificado_por_j1, email_1 as calificado_por_j1_email, fecha_1 as calificado_j1_en,
       nombre_2 as calificado_por_j2, email_2 as calificado_por_j2_email, fecha_2 as calificado_j2_en,
       round((pesos ->> 'plataforma')::numeric * (detalle_p ->> 'P')::numeric
             + coalesce((pesos ->> 'jurado_1')::numeric * puntaje_j1, 0)
             + coalesce((pesos ->> 'jurado_2')::numeric * puntaje_j2, 0), 1) as puntaje_global,
       (puntaje_j1 is null or puntaje_j2 is null) as es_parcial,
       case when puntaje_j1 is null and puntaje_j2 is null then 'Faltan ' || jurado_1_nombre || ' y ' || jurado_2_nombre
            when puntaje_j1 is null then 'Falta ' || jurado_1_nombre
            when puntaje_j2 is null then 'Falta ' || jurado_2_nombre end as falta,
       (puntaje_j1 is not null and puntaje_j2 is not null and abs(puntaje_j1 - puntaje_j2) > 25) as revisar_conjunto
from base;

comment on view public.ranking_postulaciones is
  'P, los dos jurados y el puntaje global. Los nombres salen de public.jurados; las claves jurado_1/jurado_2 son estables.';

-- ===========================================================================
-- Comprobación: si esto devuelve filas sin error, las dos partes entraron.
-- ===========================================================================
select clave, nombre, orden from public.jurados order by orden;
select count(*) as postulaciones_en_el_ranking from public.ranking_postulaciones;
select valor as pesos from public.configuracion where clave = 'pesos';

commit;

-- ============================================================================
-- Innova Social 5.0 — corrección del ranking + cierre de bucket + limpieza
-- Pegar COMPLETO en Supabase → SQL Editor (proyecto yivyqorgcagwykedngjv) y
-- ejecutar. Va dentro de una transacción: si algo falla, no queda nada a medias.
--
-- Antes de ejecutar, revisa el BLOQUE 3: borra datos. El resto es reversible.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- BLOQUE 1 · El ranking está caído: puntaje_plataforma() asigna
-- promedio_ventas_6_meses (columna `text`) a una variable numeric y revienta
-- con 22P02 ante "$1.800.000 / mes". Como la vista llama a la función por fila,
-- UNA postulación mala tumba ranking_postulaciones entera y el panel pierde
-- I, A y el puntaje global de TODAS.
-- ---------------------------------------------------------------------------

-- (ya creada el 2026-10-05; el create or replace la deja igual)
create or replace function public.ventas_a_numero(v text)
returns numeric language sql immutable set search_path = public as $fn$
  select case
    when v is null then null
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

-- ---------------------------------------------------------------------------
-- BLOQUE 2 · El bucket `postulaciones-docs` sobró de un diseño anterior: la
-- aplicación sube y lee todo en `postulaciones`. Su política de INSERT no pide
-- sesión ni valida la ruta, así que con la llave anon (pública, va dentro de
-- postular.html) cualquiera puede llenarlo de archivos de 10 MB que nadie ve.
-- El bucket está vacío. Se cierra la escritura.
-- ---------------------------------------------------------------------------
drop policy if exists "Anyone can upload postulacion docs" on storage.objects;

-- ---------------------------------------------------------------------------
-- BLOQUE 3 · Limpieza de datos de prueba.  ⚠️ ESTO BORRA. Revisa antes.
-- No toca el curso «Claude Cowork… Sesión 01» (tiene 15 recursos reales).
-- ---------------------------------------------------------------------------

-- 3.1 La postulación sembrada por SQL (no pasó por el formulario; documentos = {}).
delete from public.evaluaciones
 where postulacion_id in (select id from public.postulaciones where nombre_completo like '[PRUEBA]%');
delete from public.correos_enviados
 where postulacion_id in (select id from public.postulaciones where nombre_completo like '[PRUEBA]%');
delete from public.postulaciones where nombre_completo like '[PRUEBA]%';

-- 3.2 Los 6 registros de correo (todos en estado 'error': dominio sin verificar).
delete from public.correos_enviados;

-- 3.3 El momento de prueba.
delete from public.momentos where titulo like '[PRUEBA]%';

-- 3.4 Metadatos de los 9 adjuntos huérfanos (3 postulaciones ya borradas).
--     OJO: esto quita la fila, pero el archivo físico puede quedar en el
--     almacenamiento. Para borrarlo de verdad, hazlo desde
--     Supabase → Storage → postulaciones, seleccionando las 3 carpetas:
--       131134b8-5b40-4496-b178-613e69a67ee1
--       2dcd1a3a-af5c-4b6d-8106-7527bd0e80de
--       49f86a2d-bd14-45f9-af98-b5ca4c9af5ed
--     Si prefieres hacerlo solo por la interfaz, comenta el delete de abajo.
delete from storage.objects
 where bucket_id = 'postulaciones'
   and split_part(name, '/', 1) not in (select id::text from public.postulaciones);

-- ---------------------------------------------------------------------------
-- Comprobación: la vista debe responder sin error.
-- ---------------------------------------------------------------------------
select count(*) as postulaciones_restantes from public.ranking_postulaciones;
select count(*) as adjuntos_restantes from storage.objects where bucket_id = 'postulaciones';

commit;

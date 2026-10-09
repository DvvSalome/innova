-- puntaje_plataforma reventaba con 22P02 ("invalid input syntax for type numeric")
-- cuando promedio_ventas_6_meses traía texto con formato: la columna es `text`
-- (migración 20261001120000) y la función la asignaba directo a una variable
-- numeric. Como ranking_postulaciones llama a la función por fila, UNA sola
-- postulación con "$1.800.000 / mes" tumbaba la vista entera y el panel caía al
-- puntaje calculado en JavaScript, mostrando «falta aplicar la migración».
--
-- Aquí se extraen los dígitos antes de convertir. "$1.800.000 / mes" -> 1800000,
-- igual que lo que hoy envía el formulario (ventasNumero() manda solo dígitos).

create or replace function public.ventas_a_numero(v text)
returns numeric language sql immutable set search_path = public as $$
  select case
    when v is null then null
    -- "1.800.000" y "1,800,000" son separadores de miles; se quitan junto al resto.
    when regexp_replace(v, '[^0-9]', '', 'g') = '' then null
    else regexp_replace(v, '[^0-9]', '', 'g')::numeric
  end;
$$;

comment on function public.ventas_a_numero(text) is
  'Saca el valor numérico de un texto de ventas en COP ("$1.800.000 / mes" -> 1800000). Devuelve null si no hay dígitos.';

create or replace function public.puntaje_plataforma(p public.postulaciones)
returns jsonb
language plpgsql stable set search_path = public
as $$
declare
  d jsonb := '[]'::jsonb;
  pts int := 0;
  mx int := 0;
  x int;
  v numeric;
  c int;
  nredes int := 0;
  nods int;
begin
  x := case when p.esta_vendiendo then 10 else 0 end;
  d := d || jsonb_build_array(jsonb_build_array('¿Está vendiendo?', x, 10)); pts := pts + x; mx := mx + 10;

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
$$;

-- El bucket `postulaciones-docs` quedó de un diseño anterior: la aplicación sube
-- y lee todo en `postulaciones`. Su política de insert no pide sesión ni valida
-- la ruta, así que con la llave anon (pública, va en postular.html) cualquiera
-- podía llenarlo de archivos sin que nadie los viera. Está vacío; se cierra.
drop policy if exists "Anyone can upload postulacion docs" on storage.objects;

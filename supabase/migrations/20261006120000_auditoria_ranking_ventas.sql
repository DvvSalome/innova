-- Auditoría 6 oct 2026.
-- 1. promedio_ventas_6_meses pasó a texto (20261001120000). puntaje_plataforma lo asignaba
--    directo a numeric y con un valor como «$1.800.000 / mes» fallaba TODO el ranking
--    (y el puntaje del correo al programa). Ahora usa ventas_a_numero().
-- 2. El bucket postulaciones-docs no lo usa ningún código (el formulario sube a «postulaciones»)
--    y aceptaba subidas anónimas sin restricción de ruta: se cierra la subida pública.

CREATE OR REPLACE FUNCTION public.puntaje_plataforma(p postulaciones)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
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

  v := public.ventas_a_numero(p.promedio_ventas_6_meses::text);
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
$function$;

drop policy if exists "Anyone can upload postulacion docs" on storage.objects;

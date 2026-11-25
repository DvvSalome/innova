-- ============================================================================
-- Innova Social — cronograma de la convocatoria 5.0
--
-- Actualiza la línea de tiempo (tabla etapas_convocatoria) con las fechas de los PDF
-- oficiales «Términos de Referencia» (secciones 11 y 12) y «Preguntas Frecuentes»
-- (pregunta 8), versión del 24 nov, que reemplazan las anteriores:
--
--   1  Lanzamiento y convocatoria   4 – 18 dic              (apertura 4 dic; cierre 18 dic de 2026)
--   2  Preselección                 21 – 22 dic             (selección y evaluación)
--   3  Bootcamps y encuentros       11 – 15 ene 2027        (tabla de cronograma: bootcamp y pitch)
--   4  Presentación Pitch           12 – 15 ene 2027        (sección 11.4 y preguntas frecuentes)
--   5  Ceremonia de ganadores       19 ene 2027             (premiación)
--   6  Incubación y plan de inv.    19 ene – 15 jul 2027    (términos; las preguntas frecuentes dicen desde el 20 ene)
--
-- La página convocatoria.html lee esta tabla (el HTML es solo respaldo) y los
-- correos de confirmación también, así que sin esto se siguen viendo las fechas
-- de la edición anterior.
--
-- Pegar COMPLETO en Supabase → SQL Editor del proyecto yivyqorgcagwykedngjv y
-- ejecutar. Va en una transacción: entra todo o no entra nada. Solo cambia
-- fechas_texto de las etapas 1 a 6 (no toca nombres, iconos ni orden).
-- Se puede volver a ejecutar sin daño. NO usar `supabase db push`.
--
-- Para deshacer, los valores anteriores eran:
--   1 '1 – 22 oct' · 2 '23 – 31 oct' · 3 '10 – 27 nov' · 4 '28 – 29 nov'
--   5 '5 dic'      · 6 '6 dic – 15 jul'
-- (si el panel ya los había editado, el SELECT del principio los muestra antes de cambiar).
-- ============================================================================

begin;

-- Estado actual, para dejar constancia antes de cambiar.
select orden, nombre, fechas_texto from public.etapas_convocatoria order by orden, created_at;

do $chk$
declare n int;
begin
  select count(*) into n from public.etapas_convocatoria where orden between 1 and 6;
  if n <> 6 then
    raise exception 'Se esperaban 6 etapas (orden 1 a 6) y hay %. No se cambió nada: revisar la tabla desde el panel.', n;
  end if;
end
$chk$;

update public.etapas_convocatoria set fechas_texto = case orden
  when 1 then '4 – 18 dic'
  when 2 then '21 – 22 dic'
  when 3 then '11 – 15 ene 2027'
  when 4 then '12 – 15 ene 2027'
  when 5 then '19 ene 2027'
  when 6 then '19 ene – 15 jul 2027'
end
where orden between 1 and 6;

-- Resultado.
select orden, nombre, fechas_texto from public.etapas_convocatoria order by orden, created_at;

commit;

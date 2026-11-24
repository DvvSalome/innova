-- ============================================================================
-- Innova Social — cronograma de la convocatoria 5.0
--
-- Actualiza la línea de tiempo (tabla etapas_convocatoria) con las fechas que dio
-- el equipo el 24 nov (reemplazan las de los PDF oficiales y las del 23 nov):
--
--   1  Lanzamiento y convocatoria   4 – 18 dic (cierre por confirmar)         (apertura 4 dic; cierre propuesto 18 dic)
--   2  Preselección                 21 – 22 dic (propuesta)                   (selección propuesta 21 y 22 dic)
--   3  Bootcamps y encuentros       11 – 15 ene 2027                          (bootcamp y pitch: semana del 11 al 15 ene)
--   4  Presentación Pitch           11 – 15 ene 2027
--   5  Ceremonia de ganadores       Semana del 18 ene 2027 (por confirmar)    (semana siguiente al pitch)
--   6  Incubación y plan de inv.    Por definir                               (sin fechas todavía)
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
  when 1 then '4 – 18 dic (cierre por confirmar)'
  when 2 then '21 – 22 dic (propuesta)'
  when 3 then '11 – 15 ene 2027'
  when 4 then '11 – 15 ene 2027'
  when 5 then 'Semana del 18 ene 2027 (por confirmar)'
  when 6 then 'Por definir'
end
where orden between 1 and 6;

-- Resultado.
select orden, nombre, fechas_texto from public.etapas_convocatoria order by orden, created_at;

commit;

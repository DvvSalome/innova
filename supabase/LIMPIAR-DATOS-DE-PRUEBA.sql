-- ============================================================================
-- Innova Social — limpieza de datos de prueba
--
-- ⚠️ ESTE ARCHIVO BORRA. Léelo entero antes de ejecutarlo.
--
-- Las migraciones (corrección del ranking + jurados configurables) NO están
-- aquí: van en APLICAR-EN-PRODUCCION-2.sql. Este archivo solo depura lo que
-- quedó de las pruebas del desarrollador.
--
-- No toca el curso «Claude Cowork… Sesión 01»: tiene 15 recursos reales.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------

-- 1. La postulación sembrada por SQL (no pasó por el formulario; documentos = {}).
delete from public.evaluaciones
 where postulacion_id in (select id from public.postulaciones where nombre_completo like '[PRUEBA]%');
delete from public.correos_enviados
 where postulacion_id in (select id from public.postulaciones where nombre_completo like '[PRUEBA]%');
delete from public.postulaciones where nombre_completo like '[PRUEBA]%';

-- 2. Los 6 registros de correo (todos en estado 'error': dominio sin verificar).
delete from public.correos_enviados;

-- 3. El momento de prueba.
delete from public.momentos where titulo like '[PRUEBA]%';

-- 4. Metadatos de los 9 adjuntos huérfanos (3 postulaciones ya borradas).
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


-- Comprobación de lo que queda.
select (select count(*) from public.postulaciones)   as postulaciones,
       (select count(*) from public.momentos)        as momentos,
       (select count(*) from public.correos_enviados) as correos,
       (select count(*) from storage.objects where bucket_id='postulaciones') as adjuntos;

commit;

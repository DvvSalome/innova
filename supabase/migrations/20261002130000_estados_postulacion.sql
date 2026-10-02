-- El panel ofrece 'participante' pero la base lo rechazaba: el admin recibía
-- "violates check constraint" al intentar guardar ese estado.
-- Se reemplaza el constraint para incluirlo (reemplazo inmediato, sin tocar datos).
--
-- Estados del pipeline, según las 6 etapas reales del programa:
--   postulado       → llegó la postulación (default; lo único que el
--                     formulario público puede escribir)
--   preseleccionado → pasó el filtro inicial (etapa 02)
--   participante    → está en los bootcamps (etapas 03-04)
--   ganador         → uno de los 10 (etapa 05)
--   rechazado       → no continúa

alter table public.postulaciones drop constraint if exists postulaciones_estado_check;
alter table public.postulaciones add constraint postulaciones_estado_check
  check (estado in ('postulado', 'preseleccionado', 'participante', 'ganador', 'rechazado'));

-- ---------------------------------------------------------------------------
-- PENDIENTE (no aplicado, decisión del equipo):
--
-- promote_to_beneficiario() exige `new.user_id is not null`, pero la política
-- de insert OBLIGA user_id = NULL y ningún código lo vincula después. Resultado:
-- el trigger NUNCA se dispara y quien gana jamás obtiene el rol 'beneficiario',
-- así que nunca ve los cursos ni los recursos del programa.
--
-- Arreglo propuesto: que el trigger resuelva el perfil por correo
-- (lower(profiles.email) = lower(postulaciones.correo)) cuando user_id sea null,
-- y escriba el vínculo en user_id. Requiere pasar el trigger de AFTER a BEFORE
-- para que esa asignación persista. Probado contra Postgres real: promueve al
-- ganador, deja el vínculo trazable, y no degrada a admin/editor/evaluador.
--
-- Mientras no se aplique, hay que promover al ganador a mano:
--   update public.profiles set role='beneficiario' where email = '<correo>';
-- ---------------------------------------------------------------------------

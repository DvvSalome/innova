-- Una postulación por número de documento.
-- El formulario es público y la base no impedía repetir cédula: un script (o una persona
-- por error) podía enviar la misma postulación muchas veces y el equipo debía depurar a mano.
-- Se compara sin espacios y sin distinguir mayúsculas (pasaportes con letras).
-- Antes de aplicarla se comprobó que producción no tenía documentos repetidos; si los hubiera,
-- el índice falla y hay que resolver los duplicados primero.
create unique index if not exists postulaciones_cedula_unica
  on public.postulaciones (lower(btrim(cedula)));

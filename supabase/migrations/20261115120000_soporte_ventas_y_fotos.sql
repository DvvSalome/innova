-- Campos nuevos de la postulación:
--   1. Documentos soporte de ventas (factura electrónica, cuenta de cobro, certificación
--      comercial o contrato): hasta 4 archivos, solo para quien responde que sí vende.
--   2. Enlace a las fotos de los productos o servicios (carpeta de Drive).
-- Es aditivo: no cambia ni borra nada de lo que ya hay guardado.

-- 1. Enlace de fotos: texto opcional, http(s), sin espacios, hasta 500 caracteres.
alter table public.postulaciones add column if not exists fotos_enlace text;
alter table public.postulaciones drop constraint if exists postulaciones_fotos_enlace_valido;
alter table public.postulaciones
  add constraint postulaciones_fotos_enlace_valido check (
    fotos_enlace is null
    or (char_length(fotos_enlace) <= 500 and fotos_enlace ~* '^https?://[^[:space:]]+$')
  );

-- 2. Adjuntos: además de cedula|rut|recibo_triple_a, se admiten soporte_ventas_1 a soporte_ventas_4.
--    Misma carpeta <id>/ y mismas extensiones; el bucket sigue limitado a 10 MB y PDF/JPG/PNG.
drop policy if exists "Anyone can upload postulación documents" on storage.objects;
create policy "Anyone can upload postulación documents"
  on storage.objects for insert
  to anon, authenticated
  with check (
    bucket_id = 'postulaciones'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(cedula|rut|recibo_triple_a|soporte_ventas_[1-4])\.(pdf|jpg|jpeg|png)$'
  );

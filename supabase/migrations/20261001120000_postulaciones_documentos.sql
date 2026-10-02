-- postular.html recoge un par de campos y 3 documentos que el formulario
-- necesita guardar. rango_ganancias / tipo_discapacidad / video_url /
-- documentos (jsonb) ya existen en la tabla (se agregaron por fuera de estas
-- migraciones) — esta migración NO los vuelve a crear, solo corrige lo que
-- sigue roto:
--
-- 1. tipo_emprendimiento: el <select> del formulario envía minúscula
--    ('Emprendimiento verde' / 'Negocio verde'); el check original exigía
--    mayúscula inicial en "Verde" y rechazaba toda postulación real.
-- 2. promedio_ventas_6_meses: columna numeric, pero el campo es texto libre
--    a propósito (ej. "$1.500.000 / mes") — nunca iba a caber ahí.
-- 3. El bucket privado para subir cédula/RUT/recibo todavía no existía.

-- 1. tipo_emprendimiento — hay que soltar el check VIEJO antes de normalizar:
-- si lo hacemos al revés, el UPDATE que pasa un valor a minúscula choca con
-- el check viejo (que todavía exige mayúscula) antes de llegar a crear el nuevo.
alter table public.postulaciones drop constraint if exists postulaciones_tipo_emprendimiento_check;

update public.postulaciones
  set tipo_emprendimiento = 'Emprendimiento verde'
  where lower(tipo_emprendimiento) = 'emprendimiento verde' and tipo_emprendimiento <> 'Emprendimiento verde';
update public.postulaciones
  set tipo_emprendimiento = 'Negocio verde'
  where lower(tipo_emprendimiento) = 'negocio verde' and tipo_emprendimiento <> 'Negocio verde';

alter table public.postulaciones add constraint postulaciones_tipo_emprendimiento_check
  check (tipo_emprendimiento is null or tipo_emprendimiento in ('Emprendimiento verde', 'Negocio verde'));

-- 2. promedio_ventas_6_meses: numeric -> text
alter table public.postulaciones alter column promedio_ventas_6_meses type text;

-- 3. Storage privado para cédula/RUT/recibo de Triple A (documentos de
-- identidad y domicilio — a diferencia del bucket "cursos", este NO es público).
-- Las rutas subidas se guardan en la columna existente `documentos` (jsonb),
-- como {"cedula": "<uid>/cedula.pdf", "rut": "...", "recibo_triple_a": "..."}.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'postulaciones-docs',
  'postulaciones-docs',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Cualquiera puede subir su documento al postularse (igual que el insert en
-- la tabla postulaciones: no se exige sesión todavía confirmada).
drop policy if exists "Anyone can upload postulacion docs" on storage.objects;
create policy "Anyone can upload postulacion docs"
  on storage.objects for insert
  with check (bucket_id = 'postulaciones-docs');

-- La postulación se guarda SIN user_id (así lo exige la política de insert:
-- el vínculo con una cuenta lo hace un admin después, si gana). Sin sesión
-- propia que verificar, solo el admin puede leer estos documentos de vuelta.
drop policy if exists "Owner or admin can read postulacion docs" on storage.objects;
drop policy if exists "Admin can read postulacion docs" on storage.objects;
create policy "Admin can read postulacion docs"
  on storage.objects for select
  using (bucket_id = 'postulaciones-docs' and public.is_admin());

drop policy if exists "Admins can delete postulacion docs" on storage.objects;
create policy "Admins can delete postulacion docs"
  on storage.objects for delete
  using (bucket_id = 'postulaciones-docs' and public.is_admin());

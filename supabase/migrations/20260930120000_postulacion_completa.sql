-- Columnas que el formulario de postular.html ya pide y la tabla no tenía,
-- y bucket privado para los documentos habilitantes (cédula, RUT, recibo).
-- Sin esta migración el formulario muestra un error y conserva el borrador
-- del postulante en su navegador; no confirma una postulación que no se guardó.

alter table public.postulaciones
  add column if not exists redes jsonb not null default '[]'::jsonb,
  add column if not exists pagina_web text,
  add column if not exists rango_ganancias text,
  add column if not exists tipo_discapacidad text,
  add column if not exists video_url text,
  add column if not exists documentos jsonb not null default '{}'::jsonb;

comment on column public.postulaciones.redes is 'Redes del emprendimiento: [{"red":"Instagram","url":"https://..."}], máximo 3';
comment on column public.postulaciones.documentos is 'Rutas en el bucket postulaciones: {"cedula":"<id>/cedula.pdf","rut":...,"recibo_triple_a":...}';
comment on column public.postulaciones.promedio_ventas_6_meses is 'Promedio mensual de ventas de los últimos 6 meses, en COP';

-- El estado que usa el panel. El check original no incluía todos los valores
-- que el equipo necesita para el flujo de selección.
alter table public.postulaciones drop constraint if exists postulaciones_estado_check;
alter table public.postulaciones add constraint postulaciones_estado_check
  check (estado in ('postulado', 'preseleccionado', 'rechazado', 'ganador'));

-- Bucket privado: cualquiera puede subir al postularse; solo el equipo lee.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('postulaciones', 'postulaciones', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can upload postulación documents" on storage.objects;
create policy "Anyone can upload postulación documents"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'postulaciones');

drop policy if exists "Staff can read postulación documents" on storage.objects;
create policy "Staff can read postulación documents"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'postulaciones' and public.is_staff());

drop policy if exists "Admins can delete postulación documents" on storage.objects;
create policy "Admins can delete postulación documents"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'postulaciones' and public.is_admin());

-- is_staff() no se puede ejecutar como anon (security_hardening). Las políticas
-- de escritura de cursos no tenían rol y entraban en la evaluación de cualquier
-- subida anónima; se acotan a authenticated sin cambiar su significado.
drop policy if exists "Staff upload cursos files" on storage.objects;
create policy "Staff upload cursos files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'cursos' and public.is_staff());

drop policy if exists "Staff update cursos files" on storage.objects;
create policy "Staff update cursos files"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'cursos' and public.is_staff());

drop policy if exists "Staff delete cursos files" on storage.objects;
create policy "Staff delete cursos files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'cursos' and public.is_staff());

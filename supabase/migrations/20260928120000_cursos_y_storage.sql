-- Cursos (contenedores) + recursos vinculados + Storage para MP4/PDFs

-- ============================================================
-- 1. Tabla cursos
-- ============================================================
create table if not exists public.cursos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descripcion text,
  categoria text,
  portada_url text,
  orden int not null default 0,
  activo boolean not null default true,
  solo_beneficiarios boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cursos_orden_idx on public.cursos (orden);
create index if not exists cursos_activo_idx on public.cursos (activo) where activo;

drop trigger if exists cursos_set_updated_at on public.cursos;
create trigger cursos_set_updated_at
  before update on public.cursos
  for each row execute function public.set_updated_at();

alter table public.cursos enable row level security;

drop policy if exists "Staff can view all cursos" on public.cursos;
create policy "Staff can view all cursos"
  on public.cursos for select
  using (public.is_staff());

drop policy if exists "Beneficiarios can view active cursos" on public.cursos;
create policy "Beneficiarios can view active cursos"
  on public.cursos for select
  using (
    activo
    and auth.uid() is not null
    and (
      not solo_beneficiarios
      or public.user_role() = 'beneficiario'
      or public.is_staff()
    )
  );

drop policy if exists "Staff can insert cursos" on public.cursos;
create policy "Staff can insert cursos"
  on public.cursos for insert
  with check (public.is_staff());

drop policy if exists "Staff can update cursos" on public.cursos;
create policy "Staff can update cursos"
  on public.cursos for update
  using (public.is_staff());

drop policy if exists "Staff can delete cursos" on public.cursos;
create policy "Staff can delete cursos"
  on public.cursos for delete
  using (public.is_staff());

-- ============================================================
-- 2. Ampliar recursos: curso_id + youtube + storage
-- ============================================================
alter table public.recursos
  add column if not exists curso_id uuid references public.cursos (id) on delete cascade,
  add column if not exists storage_path text,
  add column if not exists archivo_nombre text;

create index if not exists recursos_curso_id_idx on public.recursos (curso_id, orden);

alter table public.recursos drop constraint if exists recursos_tipo_check;
alter table public.recursos add constraint recursos_tipo_check
  check (tipo in ('documento', 'video', 'youtube', 'enlace', 'plantilla', 'otro'));

-- Staff (admin + editor) gestiona recursos
drop policy if exists "Admins can insert recursos" on public.recursos;
drop policy if exists "Admins can update recursos" on public.recursos;
drop policy if exists "Admins can delete recursos" on public.recursos;

drop policy if exists "Staff can insert recursos" on public.recursos;
create policy "Staff can insert recursos"
  on public.recursos for insert
  with check (public.is_staff());

drop policy if exists "Staff can update recursos" on public.recursos;
create policy "Staff can update recursos"
  on public.recursos for update
  using (public.is_staff());

drop policy if exists "Staff can delete recursos" on public.recursos;
create policy "Staff can delete recursos"
  on public.recursos for delete
  using (public.is_staff());

-- ============================================================
-- 3. Storage bucket para materiales de cursos
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cursos',
  'cursos',
  true,
  209715200,
  array[
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/zip',
    'text/plain'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read cursos files" on storage.objects;
create policy "Public read cursos files"
  on storage.objects for select
  using (bucket_id = 'cursos');

drop policy if exists "Staff upload cursos files" on storage.objects;
create policy "Staff upload cursos files"
  on storage.objects for insert
  with check (bucket_id = 'cursos' and public.is_staff());

drop policy if exists "Staff update cursos files" on storage.objects;
create policy "Staff update cursos files"
  on storage.objects for update
  using (bucket_id = 'cursos' and public.is_staff());

drop policy if exists "Staff delete cursos files" on storage.objects;
create policy "Staff delete cursos files"
  on storage.objects for delete
  using (bucket_id = 'cursos' and public.is_staff());

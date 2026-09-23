-- Amplía el sistema de roles y crea la tabla de recursos para beneficiarios.
--
-- Roles:
--   admin        → Inngenios (acceso total)
--   editor       → Equipo Innova Social (panel de contenido)
--   beneficiario → Ganadores aceptados (recursos del programa, sin panel)

-- ============================================================
-- 1. Ampliar el CHECK de roles en profiles
-- ============================================================
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'editor', 'beneficiario'));

alter table public.profiles alter column role set default 'beneficiario';

-- Actualizar handle_new_user para que nuevos registros sean beneficiario
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'nombre_completo', ''),
    'beneficiario'
  );
  return new;
end;
$$;

-- ============================================================
-- 2. Funciones helper de roles
-- ============================================================

-- ¿Es editor o admin? (acceso al panel)
create or replace function public.is_staff()
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin', 'editor')
  );
$$;

-- Rol del usuario actual
create or replace function public.user_role()
returns text
language sql security definer stable
as $$
  select role from public.profiles
  where id = auth.uid()
  limit 1;
$$;

-- ============================================================
-- 3. Tabla de recursos (materiales para beneficiarios)
-- ============================================================
create table public.recursos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descripcion text,
  tipo text not null default 'documento'
    check (tipo in ('documento', 'video', 'enlace', 'plantilla', 'otro')),
  url text not null,
  categoria text,
  orden int not null default 0,
  solo_beneficiarios boolean not null default true,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recursos_categoria_idx on public.recursos (categoria, orden);
create index recursos_activo_idx on public.recursos (activo) where activo;

create trigger recursos_set_updated_at
  before update on public.recursos
  for each row execute function public.set_updated_at();

alter table public.recursos enable row level security;

-- Staff (admin/editor) ve todos los recursos
create policy "Staff can view all recursos"
  on public.recursos for select
  using (public.is_staff());

-- Beneficiarios ven solo los activos
create policy "Beneficiarios can view active recursos"
  on public.recursos for select
  using (
    activo
    and auth.uid() is not null
    and (
      not solo_beneficiarios
      or public.user_role() = 'beneficiario'
    )
  );

-- Solo admins gestionan recursos
create policy "Admins can insert recursos"
  on public.recursos for insert
  with check (public.is_admin());

create policy "Admins can update recursos"
  on public.recursos for update
  using (public.is_admin());

create policy "Admins can delete recursos"
  on public.recursos for delete
  using (public.is_admin());

-- ============================================================
-- 4. Auto-promoción: postulación 'ganador' → rol beneficiario
-- ============================================================
create or replace function public.promote_to_beneficiario()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.estado = 'ganador' and old.estado is distinct from 'ganador'
     and new.user_id is not null then
    update public.profiles
    set role = 'beneficiario'
    where id = new.user_id
      and role not in ('admin', 'editor');
  end if;
  return new;
end;
$$;

create trigger postulacion_ganador_promote
  after update on public.postulaciones
  for each row execute function public.promote_to_beneficiario();

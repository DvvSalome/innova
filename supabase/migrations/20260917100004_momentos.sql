-- Blog posts shown in the "Momentos"/"Blog" gallery on comunidad.html
-- and managed from the Momentos view in the panel.

create table public.momentos (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  titulo text not null,
  resumen_tarjeta text,
  cuerpo text,
  autor text not null default 'Innova Social',
  imagen_destacada_url text,
  videos jsonb not null default '[]',
  fecha_publicacion timestamptz not null default now(),
  estado text not null default 'borrador' check (estado in ('publicado', 'borrador')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index momentos_estado_idx on public.momentos (estado);
create index momentos_fecha_idx on public.momentos (fecha_publicacion desc);

create trigger momentos_set_updated_at
  before update on public.momentos
  for each row execute function public.set_updated_at();

alter table public.momentos enable row level security;

create policy "Anyone can view published momentos"
  on public.momentos for select
  using (estado = 'publicado' and fecha_publicacion <= now());

create policy "Admins can view all momentos"
  on public.momentos for select
  using (public.is_admin());

create policy "Admins can insert momentos"
  on public.momentos for insert
  with check (public.is_admin());

create policy "Admins can update momentos"
  on public.momentos for update
  using (public.is_admin());

create policy "Admins can delete momentos"
  on public.momentos for delete
  using (public.is_admin());

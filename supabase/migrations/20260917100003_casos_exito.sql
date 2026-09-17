-- The 10 winning case studies shown on casos.html and each caso-<slug>.html
-- page ("Unidades productivas" in the panel). Backed by the real numbers in
-- Informe Final Innova Social 2026.

create table public.casos_exito (
  id uuid primary key default gen_random_uuid(),
  postulacion_id uuid references public.postulaciones (id) on delete set null,

  slug text not null unique,
  company_name text not null,
  founder_names text not null,
  municipio text,

  categoria_titulo text not null,
  categoria_texto text,
  tint text not null default 'c1',

  foto_url text,
  badge_text text,
  hito text,
  resumen text,

  inversion numeric,
  ventas_antes numeric,
  ventas_actuales numeric,
  crecimiento_label text,
  hitos jsonb not null default '[]',
  nota text,

  orden int not null default 0,
  estado text not null default 'publicado' check (estado in ('publicado', 'borrador')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index casos_exito_estado_idx on public.casos_exito (estado);
create index casos_exito_orden_idx on public.casos_exito (orden);

create trigger casos_exito_set_updated_at
  before update on public.casos_exito
  for each row execute function public.set_updated_at();

alter table public.casos_exito enable row level security;

create policy "Anyone can view published casos"
  on public.casos_exito for select
  using (estado = 'publicado');

create policy "Admins can view all casos"
  on public.casos_exito for select
  using (public.is_admin());

create policy "Admins can manage casos"
  on public.casos_exito for insert
  with check (public.is_admin());

create policy "Admins can update casos"
  on public.casos_exito for update
  using (public.is_admin());

create policy "Admins can delete casos"
  on public.casos_exito for delete
  using (public.is_admin());

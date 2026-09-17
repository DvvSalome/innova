-- Content behind the Convocatoria and Resultados views in the panel:
-- the program's timeline stages, and the two result counters shown on
-- the site (current cycle vs. historical across editions).

create table public.etapas_convocatoria (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  fechas_texto text not null,
  orden int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index etapas_convocatoria_orden_idx on public.etapas_convocatoria (orden);

create trigger etapas_convocatoria_set_updated_at
  before update on public.etapas_convocatoria
  for each row execute function public.set_updated_at();

create table public.resultados_programa (
  id uuid primary key default gen_random_uuid(),
  grupo text not null check (grupo in ('actual', 'historico')),
  etiqueta text not null,
  valor numeric not null default 0,
  orden int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index resultados_programa_grupo_idx on public.resultados_programa (grupo, orden);

create trigger resultados_programa_set_updated_at
  before update on public.resultados_programa
  for each row execute function public.set_updated_at();

alter table public.etapas_convocatoria enable row level security;
alter table public.resultados_programa enable row level security;

create policy "Anyone can view etapas"
  on public.etapas_convocatoria for select
  using (true);

create policy "Admins can insert etapas"
  on public.etapas_convocatoria for insert
  with check (public.is_admin());

create policy "Admins can update etapas"
  on public.etapas_convocatoria for update
  using (public.is_admin());

create policy "Admins can delete etapas"
  on public.etapas_convocatoria for delete
  using (public.is_admin());

create policy "Anyone can view resultados"
  on public.resultados_programa for select
  using (true);

create policy "Admins can insert resultados"
  on public.resultados_programa for insert
  with check (public.is_admin());

create policy "Admins can update resultados"
  on public.resultados_programa for update
  using (public.is_admin());

create policy "Admins can delete resultados"
  on public.resultados_programa for delete
  using (public.is_admin());

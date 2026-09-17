-- One row per submission of the form in postular.html.
-- Passwords are never stored here: an applicant who creates an account
-- does so through Supabase Auth (auth.users), and user_id links back to it.

create table public.postulaciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,

  -- Datos del postulante
  nombre_completo text not null,
  correo text not null,
  whatsapp text not null,
  cedula text not null,
  genero text,
  fecha_nacimiento date,
  domicilio text not null,
  estrato text,
  nivel_educacion text,
  empleo_formal_adicional boolean,

  -- Datos del emprendimiento
  nombre_emprendimiento text not null,
  tipo_emprendimiento text check (tipo_emprendimiento in ('Emprendimiento Verde', 'Negocio Verde')),
  tipo_formalizacion text,
  categoria_negocio_verde text,
  subcategoria text,
  dedicacion_tiempo text,
  num_colaboradores int,
  municipio text not null,

  -- Objetivos de Desarrollo Sostenible alineados (1 a 17)
  ods int[] not null default '{}',

  descripcion_producto text,
  descripcion_problema text,
  descripcion_impacto text,
  descripcion_clientes text,
  promedio_ventas_6_meses numeric,
  redes_sociales text,
  uso_recurso text,

  poblacion_priorizada text,
  discapacidad text,
  etapa_emprendimiento text,
  ha_recibido_financiacion boolean,
  esta_vendiendo boolean,
  necesidades text[] not null default '{}',

  estado text not null default 'postulado'
    check (estado in ('postulado', 'preseleccionado', 'rechazado', 'ganador')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index postulaciones_estado_idx on public.postulaciones (estado);
create index postulaciones_municipio_idx on public.postulaciones (municipio);
create index postulaciones_user_id_idx on public.postulaciones (user_id);

create trigger postulaciones_set_updated_at
  before update on public.postulaciones
  for each row execute function public.set_updated_at();

alter table public.postulaciones enable row level security;

-- Anyone (including anonymous visitors) can submit the form.
create policy "Anyone can submit a postulación"
  on public.postulaciones for insert
  with check (true);

-- Applicants can see their own postulación once they have an account.
create policy "Applicants can view their own postulación"
  on public.postulaciones for select
  using (auth.uid() = user_id);

-- Only admins manage the pipeline (Participantes view in the panel).
create policy "Admins can view all postulaciones"
  on public.postulaciones for select
  using (public.is_admin());

create policy "Admins can update postulaciones"
  on public.postulaciones for update
  using (public.is_admin());

create policy "Admins can delete postulaciones"
  on public.postulaciones for delete
  using (public.is_admin());

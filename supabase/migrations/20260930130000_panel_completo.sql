-- Panel completo (informe de pruebas del 30 sept 2026):
--   1. Rol evaluador (Inngenios / Triple A) y permisos del equipo (admin + editor)
--   2. Calificación con rúbrica, puntaje de la plataforma, ranking y desempate
--   3. Registro de correos enviados
--   4. Analítica propia del sitio
--   5. Imágenes de momentos, cursos por módulos y visibilidad, íconos de etapas
--   6. Ajustes de datos señalados en el informe

-- ============================================================
-- 1. Roles
-- ============================================================
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'editor', 'evaluador', 'beneficiario'));

alter table public.profiles
  add column if not exists entidad text check (entidad is null or entidad in ('inngenios', 'triple_a')),
  add column if not exists cohorte text;

comment on column public.profiles.entidad is 'Entidad del evaluador: inngenios o triple_a (solo rol evaluador)';
comment on column public.profiles.cohorte is 'Cohorte del beneficiario, para cursos con visibilidad por cohorte (ej. 5.0)';

create or replace function public.is_evaluador()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'evaluador' and entidad is not null);
$$;

create or replace function public.mi_entidad()
returns text language sql security definer stable set search_path = public as $$
  select entidad from public.profiles where id = auth.uid() and role = 'evaluador' limit 1;
$$;

revoke execute on function public.is_evaluador() from anon;
revoke execute on function public.mi_entidad() from anon;

-- El equipo (admin + editor) administra el contenido público. Antes solo admin,
-- y los editores entraban al panel pero no podían guardar nada.
do $$
declare t text;
begin
  foreach t in array array['momentos', 'hero_sliders', 'etapas_convocatoria', 'resultados_programa'] loop
    execute format('drop policy if exists "Admins can view all %1$s" on public.%1$I', t);
    execute format('drop policy if exists "Admins can insert %1$s" on public.%1$I', t);
    execute format('drop policy if exists "Admins can update %1$s" on public.%1$I', t);
    execute format('drop policy if exists "Admins can delete %1$s" on public.%1$I', t);
    execute format('drop policy if exists "Staff can view all %1$s" on public.%1$I', t);
    execute format('drop policy if exists "Staff can insert %1$s" on public.%1$I', t);
    execute format('drop policy if exists "Staff can update %1$s" on public.%1$I', t);
    execute format('drop policy if exists "Staff can delete %1$s" on public.%1$I', t);
    execute format('create policy "Staff can view all %1$s" on public.%1$I for select to authenticated using (public.is_staff())', t);
    execute format('create policy "Staff can insert %1$s" on public.%1$I for insert to authenticated with check (public.is_staff())', t);
    execute format('create policy "Staff can update %1$s" on public.%1$I for update to authenticated using (public.is_staff())', t);
    execute format('create policy "Staff can delete %1$s" on public.%1$I for delete to authenticated using (public.is_staff())', t);
  end loop;
end $$;

-- Nombres originales de las políticas de sliders y etapas/resultados.
drop policy if exists "Admins can view all sliders" on public.hero_sliders;
drop policy if exists "Admins can insert sliders" on public.hero_sliders;
drop policy if exists "Admins can update sliders" on public.hero_sliders;
drop policy if exists "Admins can delete sliders" on public.hero_sliders;
drop policy if exists "Admins can insert etapas" on public.etapas_convocatoria;
drop policy if exists "Admins can update etapas" on public.etapas_convocatoria;
drop policy if exists "Admins can delete etapas" on public.etapas_convocatoria;
drop policy if exists "Admins can insert resultados" on public.resultados_programa;
drop policy if exists "Admins can update resultados" on public.resultados_programa;
drop policy if exists "Admins can delete resultados" on public.resultados_programa;

-- Los evaluadores leen las postulaciones (y sus adjuntos) para calificarlas.
drop policy if exists "Evaluadores can view postulaciones" on public.postulaciones;
create policy "Evaluadores can view postulaciones"
  on public.postulaciones for select to authenticated
  using (public.is_evaluador());

drop policy if exists "Staff can read postulación documents" on storage.objects;
drop policy if exists "Equipo can read postulación documents" on storage.objects;
create policy "Equipo can read postulación documents"
  on storage.objects for select to authenticated
  using (bucket_id = 'postulaciones' and (public.is_admin() or public.is_evaluador()));

-- ============================================================
-- 2. Calificación, puntaje y ranking
-- ============================================================
alter table public.postulaciones
  add column if not exists orden_desempate int,
  add column if not exists nota_desempate text;

comment on column public.postulaciones.orden_desempate is 'Orden acordado entre Inngenios y Triple A cuando hay empate en el puntaje global';

create table if not exists public.evaluaciones (
  id uuid primary key default gen_random_uuid(),
  postulacion_id uuid not null references public.postulaciones (id) on delete cascade,
  entidad text not null check (entidad in ('inngenios', 'triple_a')),
  evaluador_id uuid references auth.users (id) on delete set null,
  pertinencia int not null check (pertinencia between 1 and 5),
  modelo_negocio int not null check (modelo_negocio between 1 and 5),
  innovacion int not null check (innovacion between 1 and 5),
  potencial int not null check (potencial between 1 and 5),
  comentario text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (postulacion_id, entidad)
);

drop trigger if exists evaluaciones_set_updated_at on public.evaluaciones;
create trigger evaluaciones_set_updated_at
  before update on public.evaluaciones
  for each row execute function public.set_updated_at();

alter table public.evaluaciones enable row level security;

drop policy if exists "Admins can view evaluaciones" on public.evaluaciones;
create policy "Admins can view evaluaciones"
  on public.evaluaciones for select to authenticated using (public.is_admin());

-- Cada evaluador ve y edita solo la calificación de su entidad: no ve la del otro.
drop policy if exists "Evaluadores can view their entity" on public.evaluaciones;
create policy "Evaluadores can view their entity"
  on public.evaluaciones for select to authenticated using (entidad = public.mi_entidad());

drop policy if exists "Evaluadores can insert their entity" on public.evaluaciones;
create policy "Evaluadores can insert their entity"
  on public.evaluaciones for insert to authenticated
  with check (entidad = public.mi_entidad() and evaluador_id = auth.uid());

drop policy if exists "Evaluadores can update their entity" on public.evaluaciones;
create policy "Evaluadores can update their entity"
  on public.evaluaciones for update to authenticated
  using (entidad = public.mi_entidad())
  with check (entidad = public.mi_entidad() and evaluador_id = auth.uid());

drop policy if exists "Admins can delete evaluaciones" on public.evaluaciones;
create policy "Admins can delete evaluaciones"
  on public.evaluaciones for delete to authenticated using (public.is_admin());

create table if not exists public.configuracion (
  clave text primary key,
  valor jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.configuracion enable row level security;

drop policy if exists "Equipo can read configuracion" on public.configuracion;
create policy "Equipo can read configuracion"
  on public.configuracion for select to authenticated using (true);

drop policy if exists "Admins can write configuracion" on public.configuracion;
create policy "Admins can write configuracion"
  on public.configuracion for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into public.configuracion (clave, valor) values
  ('pesos', '{"plataforma": 0.40, "inngenios": 0.30, "triple_a": 0.30}')
on conflict (clave) do nothing;

-- Puntaje de la plataforma (P): fórmula del «Modelo de puntaje» del informe. Máximo 83 puntos, escala 0–100.
create or replace function public.puntaje_plataforma(p public.postulaciones)
returns jsonb
language plpgsql stable set search_path = public
as $$
declare
  d jsonb := '[]'::jsonb;
  pts int := 0;
  mx int := 0;
  x int;
  v numeric;
  c int;
  nredes int := 0;
  nods int;
begin
  x := case when p.esta_vendiendo then 10 else 0 end;
  d := d || jsonb_build_array(jsonb_build_array('¿Está vendiendo?', x, 10)); pts := pts + x; mx := mx + 10;

  v := p.promedio_ventas_6_meses;
  x := case when v is null or v <= 0 then 0 when v < 1000000 then 2 when v < 5000000 then 5 when v < 15000000 then 8 else 10 end;
  d := d || jsonb_build_array(jsonb_build_array('Promedio de ventas', x, 10)); pts := pts + x; mx := mx + 10;

  x := case when p.etapa_emprendimiento ilike 'Ideaci%' then 3
            when p.etapa_emprendimiento ilike 'Fortalec%' then 7
            when p.etapa_emprendimiento ilike 'Consolid%' then 10 else 0 end;
  d := d || jsonb_build_array(jsonb_build_array('Etapa', x, 10)); pts := pts + x; mx := mx + 10;

  c := p.num_colaboradores;
  x := case when c is null or c < 1 then 0 when c <= 2 then 4 when c <= 5 then 7 else 10 end;
  d := d || jsonb_build_array(jsonb_build_array('Colaboradores', x, 10)); pts := pts + x; mx := mx + 10;

  x := case when p.tipo_formalizacion ilike '%jur_dica%' then 8 when p.tipo_formalizacion ilike '%natural%' then 5 else 0 end;
  d := d || jsonb_build_array(jsonb_build_array('Formalización', x, 8)); pts := pts + x; mx := mx + 8;

  x := case when p.dedicacion_tiempo = 'Completo' then 6 when p.dedicacion_tiempo = 'Parcial' then 3 else 0 end;
  d := d || jsonb_build_array(jsonb_build_array('Dedicación', x, 6)); pts := pts + x; mx := mx + 6;

  x := case when p.empleo_formal_adicional is false then 6 when p.empleo_formal_adicional is true then 2 else 0 end;
  d := d || jsonb_build_array(jsonb_build_array('Empleo formal adicional', x, 6)); pts := pts + x; mx := mx + 6;

  x := case when lower(p.tipo_emprendimiento) = 'negocio verde' then 6 when lower(p.tipo_emprendimiento) = 'emprendimiento verde' then 3 else 0 end;
  d := d || jsonb_build_array(jsonb_build_array('Tipo de emprendimiento', x, 6)); pts := pts + x; mx := mx + 6;

  select count(*) into nods from (select distinct o from unnest(coalesce(p.ods, '{}')) as o where o in (6, 7, 9, 11, 12, 13, 15)) s;
  x := least(nods, 3) * 3;
  d := d || jsonb_build_array(jsonb_build_array('ODS prioritarios', x, 9)); pts := pts + x; mx := mx + 9;

  if jsonb_typeof(p.redes) = 'array' then nredes := jsonb_array_length(p.redes); end if;
  if nredes = 0 and coalesce(p.redes_sociales, '') <> '' then nredes := coalesce(array_length(string_to_array(p.redes_sociales, ' · '), 1), 0); end if;
  nredes := least(nredes, 3);
  x := nredes * 2;
  d := d || jsonb_build_array(jsonb_build_array('Redes sociales', x, 6)); pts := pts + x; mx := mx + 6;

  x := case when coalesce(p.pagina_web, '') <> '' and nredes > 0 then 2 else 0 end;
  d := d || jsonb_build_array(jsonb_build_array('Página web', x, 2)); pts := pts + x; mx := mx + 2;

  return jsonb_build_object('pts', pts, 'max', mx, 'P', round(pts::numeric / mx * 100, 1), 'detalle', d);
end;
$$;

-- Ranking. security_invoker: cada rol ve lo que su RLS le permite (un evaluador no ve la nota de la otra entidad).
drop view if exists public.ranking_postulaciones;
create view public.ranking_postulaciones with (security_invoker = true) as
with ev as (
  select postulacion_id,
         max(case when entidad = 'inngenios' then pertinencia + modelo_negocio + innovacion + potencial end) as suma_i,
         max(case when entidad = 'triple_a' then pertinencia + modelo_negocio + innovacion + potencial end) as suma_a
  from public.evaluaciones
  group by postulacion_id
),
w as (
  select coalesce((select valor from public.configuracion where clave = 'pesos'),
                  '{"plataforma": 0.40, "inngenios": 0.30, "triple_a": 0.30}'::jsonb) as pesos
),
base as (
  select p.id, p.created_at, p.estado, p.orden_desempate, p.nota_desempate,
         public.puntaje_plataforma(p) as detalle_p,
         round(ev.suma_i::numeric / 20 * 100, 1) as puntaje_i,
         round(ev.suma_a::numeric / 20 * 100, 1) as puntaje_a,
         w.pesos
  from public.postulaciones p
  left join ev on ev.postulacion_id = p.id
  cross join w
)
select id, created_at, estado, orden_desempate, nota_desempate,
       (detalle_p ->> 'P')::numeric as puntaje_p,
       detalle_p,
       puntaje_i,
       puntaje_a,
       round((pesos ->> 'plataforma')::numeric * (detalle_p ->> 'P')::numeric
             + coalesce((pesos ->> 'inngenios')::numeric * puntaje_i, 0)
             + coalesce((pesos ->> 'triple_a')::numeric * puntaje_a, 0), 1) as puntaje_global,
       (puntaje_i is null or puntaje_a is null) as es_parcial,
       case when puntaje_i is null and puntaje_a is null then 'Faltan Inngenios y Triple A'
            when puntaje_i is null then 'Falta Inngenios'
            when puntaje_a is null then 'Falta Triple A' end as falta,
       (puntaje_i is not null and puntaje_a is not null and abs(puntaje_i - puntaje_a) > 25) as revisar_conjunto
from base;

comment on view public.ranking_postulaciones is 'P, I, A y puntaje global (0,40·P + 0,30·I + 0,30·A por defecto; pesos en configuracion.pesos)';

-- Para los correos: puntaje de una postulación sin exponer la tabla al público.
create or replace function public.puntaje_postulacion(pid uuid)
returns jsonb language sql security definer stable set search_path = public as $$
  select public.puntaje_plataforma(p) from public.postulaciones p where p.id = pid;
$$;
revoke execute on function public.puntaje_postulacion(uuid) from public, anon, authenticated;
grant execute on function public.puntaje_postulacion(uuid) to service_role;

-- ============================================================
-- 3. Correos enviados
-- ============================================================
create table if not exists public.correos_enviados (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('nueva_postulacion', 'confirmacion_postulante', 'bienvenida_ganador', 'invitacion_equipo')),
  postulacion_id uuid references public.postulaciones (id) on delete set null,
  destinatario text not null,
  asunto text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'error')),
  proveedor_id text,
  error text,
  enviado_por uuid references auth.users (id) on delete set null,
  datos jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists correos_enviados_postulacion_idx on public.correos_enviados (postulacion_id);
create index if not exists correos_enviados_created_idx on public.correos_enviados (created_at desc);

alter table public.correos_enviados enable row level security;

drop policy if exists "Admins can view correos" on public.correos_enviados;
create policy "Admins can view correos"
  on public.correos_enviados for select to authenticated using (public.is_admin());

-- ============================================================
-- 4. Analítica del sitio (sin cookies ni IP: solo página, dispositivo, sistema y país)
-- ============================================================
create table if not exists public.visitas (
  id bigint generated always as identity primary key,
  creado timestamptz not null default now(),
  pagina text not null check (char_length(pagina) between 1 and 200),
  dispositivo text not null default 'Otro' check (dispositivo in ('Escritorio', 'Android', 'iPhone', 'iPad', 'Otro')),
  plataforma text not null default 'Otro' check (char_length(plataforma) between 1 and 40),
  pais text not null default 'Desconocido' check (char_length(pais) between 1 and 60),
  referente text check (referente is null or char_length(referente) <= 200)
);

create index if not exists visitas_creado_idx on public.visitas (creado);

alter table public.visitas enable row level security;

drop policy if exists "Anyone can record a visit" on public.visitas;
create policy "Anyone can record a visit"
  on public.visitas for insert to anon, authenticated with check (true);

drop policy if exists "Staff can view visitas" on public.visitas;
create policy "Staff can view visitas"
  on public.visitas for select to authenticated using (public.is_staff());

-- Todas las gráficas salen del mismo conjunto de filas: los totales por día, dispositivo,
-- país y plataforma siempre coinciden para el mismo periodo. Fechas en hora de Colombia.
create or replace function public.analitica_resumen(desde date, hasta date)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare r jsonb;
begin
  if not public.is_staff() then raise exception 'Solo el equipo puede ver la analítica'; end if;
  with v as (
    select (creado at time zone 'America/Bogota')::date as dia, dispositivo, plataforma, pais, pagina
    from public.visitas
    where (creado at time zone 'America/Bogota')::date between desde and hasta
  )
  select jsonb_build_object(
    'total', (select count(*) from v),
    'por_dia', coalesce((select jsonb_agg(jsonb_build_object('k', to_char(g.dia, 'YYYY-MM-DD'), 'n', coalesce(c.n, 0)) order by g.dia)
                         from generate_series(desde, hasta, interval '1 day') as g(dia)
                         left join (select dia, count(*) n from v group by dia) c on c.dia = g.dia::date), '[]'),
    'por_dispositivo', coalesce((select jsonb_agg(jsonb_build_object('k', dispositivo, 'n', n) order by n desc) from (select dispositivo, count(*) n from v group by 1) s), '[]'),
    'por_pais', coalesce((select jsonb_agg(jsonb_build_object('k', pais, 'n', n) order by n desc) from (select pais, count(*) n from v group by 1) s), '[]'),
    'por_plataforma', coalesce((select jsonb_agg(jsonb_build_object('k', plataforma, 'n', n) order by n desc) from (select plataforma, count(*) n from v group by 1) s), '[]'),
    'por_pagina', coalesce((select jsonb_agg(jsonb_build_object('k', pagina, 'n', n) order by n desc) from (select pagina, count(*) n from v group by 1 order by 2 desc limit 10) s), '[]')
  ) into r;
  return r;
end;
$$;
revoke execute on function public.analitica_resumen(date, date) from anon;

-- ============================================================
-- 5. Imágenes de momentos, cursos y etapas
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('momentos', 'momentos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read momentos images" on storage.objects;
create policy "Public read momentos images"
  on storage.objects for select using (bucket_id = 'momentos');

drop policy if exists "Staff upload momentos images" on storage.objects;
create policy "Staff upload momentos images"
  on storage.objects for insert to authenticated with check (bucket_id = 'momentos' and public.is_staff());

drop policy if exists "Staff update momentos images" on storage.objects;
create policy "Staff update momentos images"
  on storage.objects for update to authenticated using (bucket_id = 'momentos' and public.is_staff());

drop policy if exists "Staff delete momentos images" on storage.objects;
create policy "Staff delete momentos images"
  on storage.objects for delete to authenticated using (bucket_id = 'momentos' and public.is_staff());

-- Cursos: módulos y quién los ve.
alter table public.cursos
  add column if not exists visibilidad text not null default 'todos' check (visibilidad in ('todos', 'cohorte', 'emprendimiento')),
  add column if not exists cohorte text,
  add column if not exists postulacion_id uuid references public.postulaciones (id) on delete set null;

alter table public.recursos
  add column if not exists modulo text;

comment on column public.cursos.visibilidad is 'todos los beneficiarios, una cohorte (cursos.cohorte = profiles.cohorte) o un emprendimiento (cursos.postulacion_id)';
comment on column public.recursos.modulo is 'Módulo o sesión del curso al que pertenece el recurso';

drop policy if exists "Beneficiarios can view active cursos" on public.cursos;
create policy "Beneficiarios can view active cursos"
  on public.cursos for select to authenticated
  using (
    activo and (
      public.is_staff()
      or (
        (not solo_beneficiarios or public.user_role() = 'beneficiario')
        and (
          visibilidad = 'todos'
          or (visibilidad = 'cohorte' and cohorte is not null
              and cohorte = (select pr.cohorte from public.profiles pr where pr.id = auth.uid()))
          or (visibilidad = 'emprendimiento' and exists (
              select 1 from public.postulaciones po where po.id = cursos.postulacion_id and po.user_id = auth.uid()))
        )
      )
    )
  );

-- Un recurso se ve solo si su curso es visible para quien consulta.
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'recursos' and cmd = 'SELECT' and policyname not ilike 'Staff%' loop
    execute format('drop policy if exists %I on public.recursos', pol.policyname);
  end loop;
end $$;

create policy "Beneficiarios can view recursos of visible cursos"
  on public.recursos for select to authenticated
  using (
    activo
    and (not solo_beneficiarios or public.user_role() = 'beneficiario' or public.is_staff())
    and (curso_id is null or exists (select 1 from public.cursos c where c.id = recursos.curso_id))
  );

-- Etapas: ícono y descripción opcional.
alter table public.etapas_convocatoria
  add column if not exists icono text,
  add column if not exists descripcion text;

update public.etapas_convocatoria set icono = case orden
    when 1 then 'lanzamiento' when 2 then 'preseleccion' when 3 then 'bootcamp'
    when 4 then 'pitch' when 5 then 'ceremonia' when 6 then 'incubacion' end
where icono is null;


-- El ascenso automático a beneficiario no debe tocar a evaluadores.
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
      and role not in ('admin', 'editor', 'evaluador');
  end if;
  return new;
end;
$$;
revoke execute on function public.promote_to_beneficiario() from anon, authenticated;

-- Texto alternativo de la imagen destacada de cada momento.
alter table public.momentos add column if not exists imagen_alt text;

-- ============================================================
-- 6. Ajustes de datos señalados en el informe
-- ============================================================
update public.momentos set titulo = '10 negocios sostenibles listos para escalar',
  resumen_tarjeta = replace(resumen_tarjeta, '10 Negocios sostenibles', '10 negocios sostenibles')
where slug = '10-negocios-sostenibles-listos-para-escalar' and titulo ilike '10 Negocios Sostenibles listos para Escalar%';

update public.momentos set resumen_tarjeta = 'Pitch Day, un día para escuchar ideas innovadoras y con ganas de más.'
where slug = 'de-camino-al-pitch-day' and resumen_tarjeta = 'Pitch Day, un dia para escuchar ideas innovadoras y con ganas de mas.';

update public.momentos set titulo = 'Ruta de Formación — Bootcamps Innova Social 4.0',
  resumen_tarjeta = 'Bootcamps Innova Social 4.0, una ruta de camino a la consolidación empresarial con innovación y sostenibilidad.'
where slug = 'ruta-de-formacion' and titulo = 'Ruta de Formación - Bootcamps Innova Social 4.0';

update public.momentos set resumen_tarjeta = resumen_tarjeta || '.'
where slug = 'lanzamiento-innova-social-4-0' and resumen_tarjeta not like '%.';

update public.cursos set titulo = replace(titulo, 'con claude', 'con Claude')
where titulo like '%con claude%';

-- Ortografía del cuerpo de «De camino al Pitch Day» (solo si no lo han editado desde el panel).
update public.momentos set cuerpo = $cuerpo$
<p class="mom-lead">En Innova Social 4.0 sabemos que detrás de cada emprendimiento hay una historia poderosa, un problema que resolver y una persona con el coraje de intentarlo. Por eso, el camino hacia nuestro Pitch Day fue mucho más que una simple preparación: fue un proceso de transformación para cada uno de nuestros emprendedores.</p>

<h2>Las Sesiones 1:1: Donde la Magia Comenzó</h2>
<p>Antes de subir al escenario, cada emprendimiento pasó por sesiones de mentoría personalizada uno a uno con el equipo de Inngenios. Acompañamos a más de 20 emprendimientos a afinar su modelo de negocio, su propuesta de valor y, sobre todo, la manera de contar su historia.</p>

<figure class="mom-figs">
  <img src="https://apischool.innovasocial.co/storage/resource/public/MVOWV4ZVZM271fT4cjJNW4qCLSuyHbYVVYTXE0mb.jpg" alt="Sesion de mentoría 1:1" loading="lazy">
  <img src="https://apischool.innovasocial.co/storage/resource/public/RjdcH4Y1LlCAwbMQn35WAnKtWmVXX03KUoc9w6zi.jpg" alt="Mentoria del equipo Inngenios" loading="lazy">
</figure>

<p>¿Qué fue el secreto? El gancho. Trabajamos con cada emprendedor para que las primeras palabras de su pitch capturaran la atención del jurado desde el primer segundo.</p>
<p>Vimos a Carlos de Towercem transformar su discurso técnico en una historia cercana, y a muchos otros descubrir que su mayor fortaleza estaba en la claridad de su mensaje.</p>
<p>En cada sesión trabajamos la estructura del pitch, el manejo del tiempo y la seguridad al hablar en público. Poco a poco, la idea se convirtió en una presentación lista para conquistar.</p>

<h2>Pitch Day - 6 Minutos para Conquistar</h2>
<p>Llegó el gran día. Cada emprendedor contó con 6 minutos para presentar su idea ante un jurado de expertos y demostrar todo lo aprendido durante el proceso.</p>
<p>Contamos con la participación de Jaime Andrés Garzón y un panel de jurados que evaluaron cada propuesta con rigor y cercanía.</p>
<p>Desde OneFly hasta los proyectos más jóvenes, el escenario fue testigo de ideas con propósito, sostenibles y con un enorme potencial de impacto.</p>
<p>Los nervios se sintieron, pero la preparación se notó en cada intervención. Como nos dijo uno de los jurados:</p>
<blockquote>Se notó un montón la preparación, estuvo muy reñido, las calificaciones estuvieron muy buenas.</blockquote>

<h2>Más que un Concurso: Un Ecosistema</h2>
<p>Lo mejor de todo fue descubrir las conexiones que surgieron entre emprendedores, mentores y aliados. Más que competir, construimos comunidad.</p>
<p>Pronto anunciaremos a los ganadores de esta convocatoria y seguiremos acompañando a quienes se atreven a transformar su entorno.</p>
<p>Porque en Innova Social 4.0 no financiamos ideas: <strong>impulsamos ideas que transforman</strong>. Aquí el resumen de lo que fue este gran día:</p>
$cuerpo$
where slug = 'de-camino-al-pitch-day' and md5(cuerpo) = 'f88b68341b05136ac7744e0e3063c342';

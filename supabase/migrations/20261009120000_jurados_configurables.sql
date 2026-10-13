-- ============================================================================
-- Jurados configurables + identidad de quien califica
--
-- Antes el evaluador estaba cableado a dos valores: 'inngenios' y 'triple_a',
-- repetidos en un check de profiles, otro de evaluaciones, la vista del ranking
-- y la función de correos. Para reusar la plataforma en otra convocatoria había
-- que tocar SQL en cuatro sitios y redesplegar.
--
-- Ahora los jurados son filas. La clave ('jurado_1') es estable y es lo que
-- guardan las evaluaciones; el nombre visible ('Triple A', 'Alcaldía de X') lo
-- edita un admin desde el panel sin tocar código.
--
-- Además, cada calificación guarda nombre y correo de quien la puso, copiados
-- en el momento de calificar: si esa persona sale del equipo y se borra su
-- cuenta, el acta de quién calificó qué no se pierde.
-- ============================================================================

create table if not exists public.jurados (
  clave text primary key,
  nombre text not null,
  orden int not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.jurados is
  'Entidades que califican. La clave es estable y la guardan las evaluaciones; el nombre es la etiqueta visible y se puede renombrar por convocatoria.';
comment on column public.jurados.orden is
  'Posición en el ranking: 1 -> puntaje_j1, 2 -> puntaje_j2. Hoy el modelo de puntaje asume exactamente dos.';

drop trigger if exists jurados_set_updated_at on public.jurados;
create trigger jurados_set_updated_at
  before update on public.jurados
  for each row execute function public.set_updated_at();

-- Arranca con los dos de la edición 5.0, con el nombre que ya usaba el panel.
insert into public.jurados (clave, nombre, orden) values
  ('jurado_1', 'Inngenios', 1),
  ('jurado_2', 'Triple A', 2)
on conflict (clave) do nothing;

alter table public.jurados enable row level security;

drop policy if exists "Equipo lee jurados" on public.jurados;
create policy "Equipo lee jurados"
  on public.jurados for select to authenticated using (true);

drop policy if exists "Admin administra jurados" on public.jurados;
create policy "Admin administra jurados"
  on public.jurados for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Migrar los valores viejos y repuntar los checks a la tabla.
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_entidad_check;
alter table public.evaluaciones drop constraint if exists evaluaciones_entidad_check;

update public.profiles    set entidad = 'jurado_1' where entidad = 'inngenios';
update public.profiles    set entidad = 'jurado_2' where entidad = 'triple_a';
update public.evaluaciones set entidad = 'jurado_1' where entidad = 'inngenios';
update public.evaluaciones set entidad = 'jurado_2' where entidad = 'triple_a';

alter table public.profiles
  add constraint profiles_entidad_fk
  foreign key (entidad) references public.jurados (clave) on update cascade;

alter table public.evaluaciones
  add constraint evaluaciones_entidad_fk
  foreign key (entidad) references public.jurados (clave) on update cascade;

comment on column public.profiles.entidad is
  'Jurado al que pertenece quien califica (public.jurados.clave). Obligatoria en evaluadores; opcional en admin.';

-- ---------------------------------------------------------------------------
-- Identidad del calificador, congelada al momento de calificar.
-- ---------------------------------------------------------------------------
alter table public.evaluaciones
  add column if not exists evaluador_email text,
  add column if not exists evaluador_nombre text;

comment on column public.evaluaciones.evaluador_email is
  'Correo de quien calificó, copiado al calificar. Sobrevive al borrado de la cuenta (evaluador_id queda null).';

-- Rellena la identidad en cada insert/update para que el panel no dependa de
-- que el cliente la mande: el evaluador podría omitirla o falsearla.
create or replace function public.sellar_evaluador()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  new.evaluador_id := auth.uid();
  select u.email, coalesce(p.full_name, u.email)
    into new.evaluador_email, new.evaluador_nombre
    from auth.users u
    left join public.profiles p on p.id = u.id
   where u.id = auth.uid();
  return new;
end;
$fn$;

drop trigger if exists evaluaciones_sellar_evaluador on public.evaluaciones;
create trigger evaluaciones_sellar_evaluador
  before insert or update on public.evaluaciones
  for each row execute function public.sellar_evaluador();

-- ---------------------------------------------------------------------------
-- Ranking sin nombres cableados: j1/j2 salen de jurados.orden.
-- ---------------------------------------------------------------------------
insert into public.configuracion (clave, valor)
values ('pesos', '{"plataforma": 0.40, "jurado_1": 0.30, "jurado_2": 0.30}'::jsonb)
on conflict (clave) do update set valor =
  case
    when public.configuracion.valor ? 'inngenios'
    then jsonb_build_object(
      'plataforma', coalesce(public.configuracion.valor -> 'plataforma', '0.40'::jsonb),
      'jurado_1',   coalesce(public.configuracion.valor -> 'inngenios',  '0.30'::jsonb),
      'jurado_2',   coalesce(public.configuracion.valor -> 'triple_a',   '0.30'::jsonb))
    else public.configuracion.valor
  end;

drop view if exists public.ranking_postulaciones;
create view public.ranking_postulaciones with (security_invoker = true) as
with j as (
  select max(case when orden = 1 then clave end) as c1,
         max(case when orden = 2 then clave end) as c2
  from public.jurados
),
ev as (
  select e.postulacion_id,
         max(case when e.entidad = j.c1 then e.pertinencia + e.modelo_negocio + e.innovacion + e.potencial end) as suma_1,
         max(case when e.entidad = j.c2 then e.pertinencia + e.modelo_negocio + e.innovacion + e.potencial end) as suma_2,
         max(case when e.entidad = j.c1 then e.evaluador_nombre end) as nombre_1,
         max(case when e.entidad = j.c2 then e.evaluador_nombre end) as nombre_2,
         max(case when e.entidad = j.c1 then e.evaluador_email end)  as email_1,
         max(case when e.entidad = j.c2 then e.evaluador_email end)  as email_2,
         max(case when e.entidad = j.c1 then e.updated_at end) as fecha_1,
         max(case when e.entidad = j.c2 then e.updated_at end) as fecha_2
  from public.evaluaciones e cross join j
  group by e.postulacion_id
),
w as (
  select coalesce((select valor from public.configuracion where clave = 'pesos'),
                  '{"plataforma": 0.40, "jurado_1": 0.30, "jurado_2": 0.30}'::jsonb) as pesos
),
base as (
  select p.id, p.created_at, p.estado, p.orden_desempate, p.nota_desempate,
         public.puntaje_plataforma(p) as detalle_p,
         round(ev.suma_1::numeric / 20 * 100, 1) as puntaje_j1,
         round(ev.suma_2::numeric / 20 * 100, 1) as puntaje_j2,
         ev.nombre_1, ev.nombre_2, ev.email_1, ev.email_2, ev.fecha_1, ev.fecha_2,
         w.pesos,
         (select nombre from public.jurados where orden = 1) as jurado_1_nombre,
         (select nombre from public.jurados where orden = 2) as jurado_2_nombre
  from public.postulaciones p
  left join ev on ev.postulacion_id = p.id
  cross join w
)
select id, created_at, estado, orden_desempate, nota_desempate,
       (detalle_p ->> 'P')::numeric as puntaje_p,
       detalle_p,
       puntaje_j1, puntaje_j2,
       jurado_1_nombre, jurado_2_nombre,
       nombre_1 as calificado_por_j1, email_1 as calificado_por_j1_email, fecha_1 as calificado_j1_en,
       nombre_2 as calificado_por_j2, email_2 as calificado_por_j2_email, fecha_2 as calificado_j2_en,
       round((pesos ->> 'plataforma')::numeric * (detalle_p ->> 'P')::numeric
             + coalesce((pesos ->> 'jurado_1')::numeric * puntaje_j1, 0)
             + coalesce((pesos ->> 'jurado_2')::numeric * puntaje_j2, 0), 1) as puntaje_global,
       (puntaje_j1 is null or puntaje_j2 is null) as es_parcial,
       case when puntaje_j1 is null and puntaje_j2 is null then 'Faltan ' || jurado_1_nombre || ' y ' || jurado_2_nombre
            when puntaje_j1 is null then 'Falta ' || jurado_1_nombre
            when puntaje_j2 is null then 'Falta ' || jurado_2_nombre end as falta,
       (puntaje_j1 is not null and puntaje_j2 is not null and abs(puntaje_j1 - puntaje_j2) > 25) as revisar_conjunto
from base;

comment on view public.ranking_postulaciones is
  'P, los dos jurados y el puntaje global. Los nombres salen de public.jurados; las claves jurado_1/jurado_2 son estables.';

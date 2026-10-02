-- Los administradores de Inngenios (u otra entidad) también califican.
-- Antes mi_entidad() solo devolvía entidad si role = 'evaluador', así que
-- un admin con entidad no podía insertar/actualizar evaluaciones por RLS.

comment on column public.profiles.entidad is
  'Entidad de calificación: inngenios o triple_a. Obligatoria en evaluadores; opcional en admin (si la tiene, puede calificar como esa entidad).';

create or replace function public.mi_entidad()
returns text language sql security definer stable set search_path = public as $$
  select entidad from public.profiles
  where id = auth.uid()
    and entidad is not null
    and role in ('evaluador', 'admin')
  limit 1;
$$;

revoke execute on function public.mi_entidad() from anon;

-- Admins de Inngenios (correo del programa) califican como inngenios.
update public.profiles
set entidad = 'inngenios'
where role = 'admin'
  and entidad is null
  and lower(email) like '%@inngenios.co';

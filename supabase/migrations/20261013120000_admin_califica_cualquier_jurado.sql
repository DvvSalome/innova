-- Cualquier administrador califica como cualquiera de los jurados.
--
-- Antes un admin solo podía calificar como el jurado de su perfil (profiles.entidad)
-- y la calificación quedaba a nombre de la cuenta. Ahora el admin elige el jurado al
-- calificar y escribe el nombre y el correo de la persona que califica; eso es lo que
-- queda en el acta. La cuenta desde la que se guardó también queda registrada.
-- Los evaluadores no cambian: califican solo como su jurado y a nombre de su cuenta.

alter table public.evaluaciones
  add column if not exists registrado_por_email text;

comment on column public.evaluaciones.registrado_por_email is
  'Correo de la cuenta que guardó la calificación. Puede diferir de evaluador_email cuando un admin registra la nota de otra persona.';

drop policy if exists "Admins can insert evaluaciones" on public.evaluaciones;
create policy "Admins can insert evaluaciones"
  on public.evaluaciones for insert to authenticated
  with check (public.is_admin() and evaluador_id = auth.uid());

drop policy if exists "Admins can update evaluaciones" on public.evaluaciones;
create policy "Admins can update evaluaciones"
  on public.evaluaciones for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.sellar_evaluador()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  cuenta text;
begin
  -- Sin sesión (editor SQL, service role): se respeta lo que trae la fila.
  if auth.uid() is null then return new; end if;

  select email into cuenta from auth.users where id = auth.uid();
  new.evaluador_id := auth.uid();
  new.registrado_por_email := cuenta;

  if public.is_admin()
     and nullif(btrim(coalesce(new.evaluador_nombre, '')), '') is not null
     and nullif(btrim(coalesce(new.evaluador_email, '')), '') is not null then
    new.evaluador_nombre := left(btrim(new.evaluador_nombre), 120);
    new.evaluador_email := lower(btrim(new.evaluador_email));
    if new.evaluador_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$' or length(new.evaluador_email) > 200 then
      raise exception 'El correo de quien califica no es válido' using errcode = '22023';
    end if;
  else
    select u.email, coalesce(p.full_name, u.email)
      into new.evaluador_email, new.evaluador_nombre
      from auth.users u
      left join public.profiles p on p.id = u.id
     where u.id = auth.uid();
  end if;
  return new;
end;
$fn$;

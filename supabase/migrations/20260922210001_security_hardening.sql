-- Cierra advertencias del security advisor:
-- 1. Fija search_path en todas las funciones
-- 2. Revoca EXECUTE desde anon/authenticated en funciones internas
--    (siguen funcionando dentro de RLS policies y triggers)

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin', 'editor')
  );
$$;

create or replace function public.user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles
  where id = auth.uid()
  limit 1;
$$;

-- Revocar acceso directo vía API REST a funciones internas
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.promote_to_beneficiario() from anon, authenticated;
revoke execute on function public.set_updated_at() from anon, authenticated;

-- is_admin, is_staff, user_role: solo authenticated (necesarios para RLS)
revoke execute on function public.is_admin() from anon;
revoke execute on function public.is_staff() from anon;
revoke execute on function public.user_role() from anon;

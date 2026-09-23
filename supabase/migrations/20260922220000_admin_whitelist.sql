-- Tabla ligera con los correos que deben ser admin al registrarse.
-- Cuando el segundo admin exista, solo hay que insertar una fila acá.
create table public.admin_whitelist (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table public.admin_whitelist enable row level security;

create policy "Admins can view whitelist"
  on public.admin_whitelist for select
  using (public.is_admin());

create policy "Admins can insert whitelist"
  on public.admin_whitelist for insert
  with check (public.is_admin());

create policy "Admins can delete whitelist"
  on public.admin_whitelist for delete
  using (public.is_admin());

-- Primer admin
insert into public.admin_whitelist (email) values ('cristian@inngenios.co');

-- Actualizar handle_new_user: si el correo está en la whitelist → admin
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  _role text := 'beneficiario';
begin
  if exists (select 1 from public.admin_whitelist where email = new.email) then
    _role := 'admin';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'nombre_completo', ''),
    _role
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from anon, authenticated;

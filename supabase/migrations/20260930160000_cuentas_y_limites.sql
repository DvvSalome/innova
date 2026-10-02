-- 1. Las cuentas solo existen para ganadores autorizados.
--    El registro público de Supabase Auth sigue siendo alcanzable, así que una cuenta nueva nace
--    SIN acceso («pendiente») y solo pasa a «beneficiario» cuando el equipo autoriza a un ganador.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'editor', 'evaluador', 'beneficiario', 'pendiente'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  _role text := 'pendiente';
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

-- Autorizar a un ganador (estado «ganador» o cuenta asignada) lo promueve a beneficiario.
create or replace function public.promote_to_beneficiario()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.estado = 'ganador' and new.user_id is not null
     and (old.estado is distinct from 'ganador' or old.user_id is distinct from new.user_id) then
    update public.profiles
    set role = 'beneficiario'
    where id = new.user_id
      and role not in ('admin', 'editor', 'evaluador');
  end if;
  return new;
end;
$$;

-- 2. Límites de tamaño en lo que envía el público (el formulario ya limita menos que esto).
alter table public.postulaciones
  add constraint postulaciones_limites_texto check (
    char_length(nombre_completo) <= 200 and char_length(correo) <= 254 and char_length(whatsapp) <= 25
    and char_length(cedula) <= 30 and char_length(nombre_emprendimiento) <= 200
    and char_length(municipio) <= 100 and char_length(domicilio) <= 100
    and char_length(coalesce(subcategoria, '')) <= 200 and char_length(coalesce(categoria_negocio_verde, '')) <= 200
    and char_length(coalesce(descripcion_producto, '')) <= 2000 and char_length(coalesce(descripcion_problema, '')) <= 2000
    and char_length(coalesce(descripcion_impacto, '')) <= 2000 and char_length(coalesce(descripcion_clientes, '')) <= 2000
    and char_length(coalesce(uso_recurso, '')) <= 2000 and char_length(coalesce(redes_sociales, '')) <= 1000
    and char_length(coalesce(pagina_web, '')) <= 500 and char_length(coalesce(video_url, '')) <= 500
    and char_length(coalesce(rango_ganancias, '')) <= 100 and char_length(coalesce(tipo_discapacidad, '')) <= 100
  ),
  add constraint postulaciones_limites_listas check (
    cardinality(ods) <= 17 and cardinality(necesidades) <= 20
    and jsonb_typeof(redes) = 'array' and jsonb_array_length(redes) <= 3
    and jsonb_typeof(documentos) = 'object' and pg_column_size(documentos) <= 2000
  );

-- 3. Los adjuntos solo pueden subirse con la ruta que usa el formulario: <id>/cedula|rut|recibo_triple_a.<ext>
drop policy if exists "Anyone can upload postulación documents" on storage.objects;
create policy "Anyone can upload postulación documents"
  on storage.objects for insert
  to anon, authenticated
  with check (
    bucket_id = 'postulaciones'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(cedula|rut|recibo_triple_a)\.(pdf|jpg|jpeg|png)$'
  );

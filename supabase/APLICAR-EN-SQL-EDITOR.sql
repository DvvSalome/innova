-- ============================================================================
-- Innova Social — dos migraciones en un solo archivo
--
--   1. Una postulación por número de documento   (20261110120000_una_postulacion_por_cedula)
--   2. Documentos soporte de ventas y fotos      (20261115120000_soporte_ventas_y_fotos)
--
-- Pegar COMPLETO en Supabase → SQL Editor del proyecto yivyqorgcagwykedngjv
-- y ejecutar. Va dentro de una transacción: entra todo o no entra nada.
--
-- NO borra ni modifica postulaciones. Si ya hay dos postulaciones con el mismo
-- documento, la parte 1 se detiene con un mensaje que las nombra y no cambia nada.
--
-- Se puede volver a ejecutar sin daño: todo es if not exists / drop if exists.
-- NO usar `supabase db push` (el historial remoto no coincide con el local).
-- ============================================================================

begin;

-- ===========================================================================
-- PARTE 1 · Una postulación por número de documento
-- Se compara sin espacios y sin distinguir mayúsculas (pasaportes con letras).
-- ===========================================================================

do $chk$
declare repetidas text;
begin
  select string_agg(d, ', ') into repetidas
  from (select lower(btrim(cedula)) as d from public.postulaciones
        group by 1 having count(*) > 1) x;
  if repetidas is not null then
    raise exception 'Hay postulaciones con el mismo documento (%). Resuélvelas antes de aplicar esta migración.', repetidas;
  end if;
end
$chk$;

create unique index if not exists postulaciones_cedula_unica
  on public.postulaciones (lower(btrim(cedula)));

-- ===========================================================================
-- PARTE 2 · Documentos soporte de ventas y fotos de productos
-- Es aditivo: no cambia ni borra nada de lo que ya hay guardado.
-- ===========================================================================

-- 1. Enlace de fotos: texto opcional, http(s), sin espacios, hasta 500 caracteres.
alter table public.postulaciones add column if not exists fotos_enlace text;
alter table public.postulaciones drop constraint if exists postulaciones_fotos_enlace_valido;
alter table public.postulaciones
  add constraint postulaciones_fotos_enlace_valido check (
    fotos_enlace is null
    or (char_length(fotos_enlace) <= 500 and fotos_enlace ~* '^https?://[^[:space:]]+$')
  );

-- 2. Adjuntos: además de cedula|rut|recibo_triple_a, se admiten soporte_ventas_1 a soporte_ventas_4.
--    Misma carpeta <id>/ y mismas extensiones; el bucket sigue limitado a 10 MB y PDF/JPG/PNG.
drop policy if exists "Anyone can upload postulación documents" on storage.objects;
create policy "Anyone can upload postulación documents"
  on storage.objects for insert
  to anon, authenticated
  with check (
    bucket_id = 'postulaciones'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(cedula|rut|recibo_triple_a|soporte_ventas_[1-4])\.(pdf|jpg|jpeg|png)$'
  );

-- ===========================================================================
-- Comprobación: deben salir cinco filas, todas con ok = true.
-- ===========================================================================
select 'indice cedula unica' as comprobacion,
       exists(select 1 from pg_indexes where schemaname = 'public' and indexname = 'postulaciones_cedula_unica') as ok
union all
select 'columna fotos_enlace',
       exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'postulaciones' and column_name = 'fotos_enlace')
union all
select 'restriccion fotos_enlace',
       exists(select 1 from pg_constraint where conname = 'postulaciones_fotos_enlace_valido')
union all
select 'politica de subida con soporte_ventas',
       exists(select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
              and policyname = 'Anyone can upload postulación documents' and with_check like '%soporte_ventas%')
union all
select 'las postulaciones existentes siguen ahí', (select count(*) > 0 from public.postulaciones);

commit;

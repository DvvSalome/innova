-- Un visitante solo puede crear postulaciones «en bruto»: no puede enviarse ya como
-- ganador/preseleccionado, ni asignarse una cuenta (user_id), ni fijar el orden de desempate.
-- Antes la política aceptaba cualquier valor (with check (true)).

drop policy if exists "Anyone can submit a postulación" on public.postulaciones;
create policy "Anyone can submit a postulación"
  on public.postulaciones for insert
  to anon, authenticated
  with check (
    estado = 'postulado'
    and user_id is null
    and orden_desempate is null
    and nota_desempate is null
  );

-- Funciones que no deben poder llamarse desde la API pública.
-- Los disparadores se ejecutan igual (el permiso se revisa al crear el disparador).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.promote_to_beneficiario() from public, anon, authenticated;

-- La analítica solo la usa el equipo con sesión iniciada.
revoke execute on function public.analitica_resumen(date, date) from public, anon;
grant execute on function public.analitica_resumen(date, date) to authenticated;

-- is_admin(), is_staff(), is_evaluador(), mi_entidad() y user_role() se dejan como están:
-- las políticas de lectura pública las evalúan para visitantes y no exponen datos.

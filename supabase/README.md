# Base de datos — Innova Social 4.0

Migraciones para el panel de administración (`admin.html`) y el formulario de
postulación (`postular.html`). Sin conexión activa a Supabase todavía — este
SQL queda listo para correr apenas se autorice.

## Cómo aplicarlo

Con el proyecto ya conectado (`supabase link --project-ref <ref>`):

```bash
supabase db push
```

Esto corre todo `migrations/` en orden y, si usas `--include-seed` (o
`supabase db reset` en local), también carga `seed.sql` con la información
real de los 10 casos, las etapas de la convocatoria, los resultados y los
4 Momentos ya publicados.

Sin CLI: pega cada archivo de `migrations/` en el SQL Editor del dashboard de
Supabase, en orden por nombre (el prefijo de fecha ya los ordena), y luego
`seed.sql`.

## Tablas

- `profiles` — cuentas del panel (`admin`/`editor`), una fila por usuario de Supabase Auth.
- `postulaciones` — cada envío del formulario de `postular.html`. Público solo puede insertar; nunca se guarda contraseña acá (eso lo maneja Supabase Auth).
- `casos_exito` — los 10 ganadores mostrados en `casos.html` y en cada `caso-<slug>.html`.
- `momentos` — el blog de `comunidad.html`.
- `hero_sliders` — fotos rotativas del hero en `index.html`.
- `etapas_convocatoria` / `resultados_programa` — contenido de las vistas Convocatoria y Resultados del panel.

## Después de aplicarlo

1. Que la primera persona (ej. `cristian@inngenios.co`) se registre normal vía Supabase Auth — le crea su fila en `profiles` con rol `editor`.
2. Subir su rol a admin a mano, una sola vez:
   ```sql
   update public.profiles set role = 'admin' where email = 'cristian@inngenios.co';
   ```
3. `hero_sliders.imagen_url` en el seed son nombres de archivo de ejemplo (`hero-emprendedores-01.jpg`) — reemplázalos por las URLs reales una vez subas las fotos a Supabase Storage.

## Lo que falta

Este SQL crea el esquema y lo llena con los datos reales que ya existen en el
sitio. Conectar `admin.html` y `postular.html` a estas tablas (en vez de a los
arreglos de JavaScript de ejemplo) es un paso aparte, todavía no hecho.

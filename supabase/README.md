# Base de datos — Innova Social 5.0

Backend del sitio público, del formulario de postulación (`postular.html`), del
panel (`admin.html`) y del área de beneficiarios (`acceso.html`, `mis-cursos.html`,
`curso.html`). Proyecto de Supabase: `yivyqorgcagwykedngjv`.

## Estado en producción (30 sept 2026)

- Aplicadas `20260930120000_postulacion_completa.sql`, `20260930130000_panel_completo.sql`,
  `20260930140000_endurecer_postulaciones.sql` (un visitante ya no puede enviarse como ganador ni
  asignarse cuenta) y `20260930150000_cerrar_funciones.sql`, y `20260930160000_cuentas_y_limites.sql` (las cuentas nuevas
  nacen «pendiente», límites de tamaño y rutas de adjuntos) — todas registradas con
  `supabase migration repair --status applied`.
- Desplegada la función `correos` (`supabase functions deploy correos --use-api`).

Ojo: las migraciones anteriores se aplicaron en producción con otros nombres de
versión, así que **no uses `supabase db push`** (intentaría repetirlas). Para una
migración nueva, pruébala primero dentro de una transacción que termine en
`rollback;` y luego aplícala:

```bash
supabase db query --linked -f supabase/migrations/<archivo>.sql
supabase migration repair --status applied <versión>
```

## Tablas

- `profiles` — cuentas: `admin`, `editor`, `evaluador` (con `entidad` = `inngenios` o `triple_a`) y `beneficiario` (con `cohorte`).
- `postulaciones` — cada envío del formulario, con `redes`, `documentos` (rutas en el bucket privado `postulaciones`), `orden_desempate` y `nota_desempate`.
- `evaluaciones` — rúbrica de 4 criterios (1–5) por postulación y entidad. Cada evaluador solo ve la de su entidad.
- `ranking_postulaciones` (vista) — P, I, A, global, parcial/falta y «revisar en conjunto» (|I − A| > 25).
- `configuracion` — `pesos` del puntaje global (40 / 30 / 30 por defecto).
- `correos_enviados` — registro de cada correo con su estado y error.
- `visitas` + `analitica_resumen(desde, hasta)` — analítica propia del sitio (sin cookies ni IP).
- `momentos`, `hero_sliders`, `etapas_convocatoria`, `resultados_programa` — contenido que se edita en el panel y se ve en el sitio (`sitio-datos.js`).
- `cursos` (con `visibilidad`: todos / cohorte / emprendimiento) y `recursos` (con `modulo`).

Buckets: `postulaciones` (privado, 10 MB, PDF/JPG/PNG), `momentos` (público, imágenes del blog y del inicio) y `cursos` (público, materiales).

## Correos (función `correos`, Resend)

Secretos de la función:

```bash
supabase secrets set RESEND_API_KEY=...            # lo pone la persona dueña de la cuenta de Resend
supabase secrets set CORREO_REMITENTE="Innova Social <convocatoria@dominio-verificado>"
supabase secrets set CORREO_PROGRAMA=correo-del-programa@...
supabase secrets set SITE_URL=https://innova-eta.vercel.app
```

En Supabase → Authentication → URL Configuration hay que permitir
`https://innova-eta.vercel.app/acceso.html` (y `http://localhost:4173/acceso.html`
para pruebas): es a donde llevan los enlaces para crear la contraseña.

## Roles

- La primera cuenta admin se crea desde el dashboard (Authentication → Add user). Si su correo está en `admin_whitelist`, entra como admin automáticamente.
- Después, todo el equipo se invita desde el panel: Ajustes → Equipo y accesos.
- Los beneficiarios se crean al autorizar un ganador en la ficha de su postulación.

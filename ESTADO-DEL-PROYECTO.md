# Estado del proyecto — Innova Social 5.0

Actualizado: 14 oct 2026. Sitio publicado: https://convocatoria.innovasocial.co (Vercel, se despliega solo al subir a `main`). Proyecto Supabase: `yivyqorgcagwykedngjv`.

Este documento resume qué está hecho y qué falta. El detalle de cada prueba está en [AUDITORIA-BACKEND.md](AUDITORIA-BACKEND.md). Cómo aplicar migraciones y desplegar la función de correos está en [supabase/README.md](supabase/README.md). El recorrido de punta a punta por rol, con capturas, está en `docs/flujo-e2e/informe.html`.

---

## 1. Lo que está hecho

### Sitio público
- Todo lo que habla de la convocatoria actual dice **Innova Social 5.0**. Se mantiene 4.0 solo en hechos de la edición anterior (casos, cifras del informe final, momentos de 2025).
- Ortografía y redacción corregidas (B1–B13 del informe de pruebas), sección «Impacto colectivo» retirada, blog sin velo gris, categorías con ampliación, contadores que llegan al valor real.
- Etapas con los íconos oficiales de marca.
- Contenido editable desde el panel y leído por el sitio (`sitio-datos.js`): fotos del inicio, momentos, etapas y resultados. Si la base no responde, cada página muestra su contenido original.
- Los momentos se filtran antes de mostrarse (no puede colarse código) y las entradas `[PRUEBA]` no aparecen en las listas públicas.
- Analítica propia sin cookies (`api/track.js`).

### Formulario de postulación (`postular.html`)
- Guarda todas las respuestas en Supabase, sube cédula, RUT y recibo de Triple A a un espacio privado y avisa por correo.
- Las 12 mejoras del informe (borrador automático, ventas en COP, contadores, ODS, mayoría de edad, archivos, video, documento según tipo) y redes de 1 a 3 con `@usuario` convertido en enlace.
- Acepta archivos sin tipo declarado o con extensión en mayúsculas (caso típico de Windows): el tipo se toma del archivo y el nombre se normaliza.
- Sin contraseña: las cuentas se crean solo para ganadores autorizados.

### Base de datos y seguridad
Los cambios de todas las migraciones de `supabase/migrations/` están en producción; la batería de pruebas los ejercita. Ojo: el historial remoto no registra con su nombre local `20261001120000`, `20261002130000`, `20261002160000`, `20261005120000` ni `20261009120000` (se aplicaron por otra vía o con otro nombre), así que **nunca uses `supabase db push`**. Las de esta etapa:
- `20260930120000` a `20260930160000`: formulario completo, panel, roles, ranking, endurecimiento, funciones cerradas, cuentas que nacen «pendiente» y límites de tamaño.
- `20261001120000` documentos de la postulación · `20261002130000` estado «participante» · `20261002160000` admins que califican.
- `20261005120000` y `20261006120000`: el ranking ya no se cae con ventas escritas como texto («$1.800.000 / mes»); se cierra la subida anónima al bucket `postulaciones-docs`.
- `20261009120000` **jurados configurables**: los jurados son filas (`jurado_1`, `jurado_2`) con un nombre editable («Inngenios», «Triple A»), y cada calificación guarda el nombre y el correo de quien califica.
- `20261013120000` **cualquier administrador califica como cualquier jurado**, escribiendo el nombre y el correo de quien califica. También queda registrada la cuenta desde la que se guardó.

### Panel de administración (`admin.html`)
- Roles: **administrador** (todo, y califica como cualquier jurado), **editor** (contenido web y cursos) y **evaluador** (solo califica, como su jurado).
- **Participantes y ranking:** puntaje de la plataforma (P, máx. 83 puntos), Jurado 1, Jurado 2 y global (40 / 30 / 30 por defecto, editable). Incluye parcial con lo que falta, empates, aviso si los jurados difieren en más de 25 puntos, posible duplicada, ficha completa, adjuntos con enlace temporal y exportación CSV.
- **Calificar:** rúbrica de cuatro criterios (1 a 5). El administrador abre la postulación, ve «Inngenios (Jurado 1)» y «Triple A (Jurado 2)» y califica con cualquiera; la rúbrica le pide el nombre y el correo de quien califica. El evaluador solo ve y califica su jurado.
- **Autorizar ganador:** crea la cuenta de beneficiario y envía un enlace para crear la contraseña (nunca la contraseña).
- Momentos (editor visual, borrador, fechas en hora de Colombia), cursos por módulos con visibilidad (todos, cohorte o emprendimiento), fotos del inicio, etapas, resultados, analítica, registro de correos con reenvío, equipo y accesos, pesos del puntaje y ayuda.
- El módulo de Seguimiento (maqueta) se retiró del panel.

### Correos y área del beneficiario
- Función `correos` desplegada: aviso al programa, confirmación al postulante, bienvenida al ganador e invitación al equipo. Valida los jurados contra la tabla.
- `SITE_URL` apunta a `https://convocatoria.innovasocial.co` (hasta el 14 oct apuntaba a `innovasociall.co`, un dominio que no existe, y los enlaces de los correos no abrían).
- El 8 oct salió un aviso al programa real desde el formulario publicado.
- `acceso.html` (crear contraseña, entrar, recuperar), `mis-cursos.html` y `curso.html` para beneficiarios.

### Pruebas
- `supabase/tests/permisos.sql`: **70 comprobaciones** de permisos y lógica contra producción, en una transacción que se deshace (visitante, administrador con y sin jurado, editor, evaluadores, evaluador sin jurado, cuenta pendiente, beneficiario, jurados configurables e integridad). Resultado del 13 oct: 70 / 70.
- Recorrido de punta a punta por rol en localhost con el backend simulado (`sw-simulado.js`): postulante, administrador, los dos jurados, editor y beneficiaria. Son 48 capturas en `docs/flujo-e2e/`.
- 8 oct: postulación real en el sitio publicado con archivos sin tipo declarado; quedó guardada con sus documentos y puntaje, y se borró después.

### Datos en producción (14 oct)
0 postulaciones, 0 correos registrados, 1 administrador, 0 evaluadores, 0 beneficiarios, 1 curso y 4 momentos publicados. No quedan datos de prueba.

---

## 2. Lo que falta

### Bloquea el acceso de los ganadores
1. **Supabase → Authentication → URL Configuration:** agregar `https://convocatoria.innovasocial.co/acceso.html` a las direcciones permitidas. Sin esto, el enlace «Crear mi contraseña» de la ganadora y de las invitaciones al equipo no funciona. Solo lo puede hacer el dueño del proyecto.
2. Después: autorizar un ganador de prueba desde el panel, abrir el enlace del correo, crear la contraseña y borrar la prueba.

### Ajustes en el panel de Supabase (dueño del proyecto)
- Desactivar **Allow new users to sign up** (hoy el registro público sigue abierto; las cuentas nuevas nacen sin acceso, pero conviene cerrarlo).
- Activar **Leaked password protection** (puede requerir plan Pro).
- Authentication → SMTP con Resend, para que «¿Olvidaste tu contraseña?» salga del dominio del programa.

### Prueba con sesiones reales
- Invitar a los evaluadores reales desde «Equipo y accesos» (hoy no hay ninguno).
- Que un administrador real haga una calificación de prueba con nombre y correo, y la borre.
- Subir un curso con archivos reales y un momento con imagen.

### Contenido
- **Imágenes del blog:** resuelto el 14 oct. Las portadas de 3 momentos daban 404 en `apischool.innovasocial.co`; ahora están en el bucket `momentos` del proyecto (`portadas/<slug>.jpg`) y tienen texto alternativo. También se pasaron las 2 imágenes de «De camino al Pitch Day» (portada y cuerpo): ningún momento depende ya de ese servidor.
- **URL pública del informe** para el botón «Descargar Informe Innova Social 2025» de `casos.html` (hoy apunta a `#`).
- Logo 5.0 para el encabezado de los correos (hoy la marca va en texto).

### Decisiones del equipo
- **Dominio:** `innovasociall.co` no está registrado. Si se compra, hay que agregarlo en Vercel y actualizar `SITE_URL` y las direcciones permitidas de Supabase.
- **WhatsApp:** la confirmación por WhatsApp necesita una cuenta de WhatsApp Business; hoy solo se confirma por correo.
- **Pesos del puntaje** (40 / 30 / 30 por defecto), si la población priorizada suma puntos y si «Ninguna» formalización suma 0.
- **Cronograma 5.0** definitivo y fecha del Pitch Day.
- **Contenido por aclarar (C1–C6 del informe):** 6 o 9 meses de acompañamiento; nombre comercial de «Manteca de Cerdo»; «1,6 toneladas» mensual o única; facturas en los requisitos; fecha del momento «De camino al Pitch Day»; cifras que no coinciden entre el inicio ($95.705.000 y 87 %) y los casos ($99.888.140 y 66 %).

### Mejoras sugeridas (no bloquean)
- Si Resend falla al enviar, no se reintenta solo: hay que reenviar desde «Correos enviados».
- Al borrar una postulación sus adjuntos quedan en el almacenamiento; el panel no ofrece borrar postulaciones.
- Un límite de envíos por visitante en el formulario público (hoy solo hay topes de tamaño).

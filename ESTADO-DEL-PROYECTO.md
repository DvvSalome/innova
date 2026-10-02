# Estado del proyecto — Innova Social 5.0

Actualizado: 1 oct 2026. Sitio publicado: https://innova-eta.vercel.app (versión anterior, ver «Pendiente»). Proyecto Supabase: `yivyqorgcagwykedngjv`.

Este documento resume lo que se hizo a raíz del «Informe de pruebas y revisión — Plataforma Innova Social» (30 sept 2026) y lo que falta. El detalle punto por punto, con la evidencia de cada prueba, está en [AUDITORIA-BACKEND.md](AUDITORIA-BACKEND.md). La base de datos y el despliegue de funciones están en [supabase/README.md](supabase/README.md).

---

## 1. Lo que se hizo

### Sitio público
- Todo lo que habla de la convocatoria actual dice **Innova Social 5.0** (pestañas, logo, pie, portada, Nosotros, Convocatoria, formulario). Se mantiene 4.0 solo en hechos de la edición anterior (casos, cifras del informe final, momentos de 2025).
- Corregida la ortografía y la redacción (B1–B13 del informe): «Revisa», «Subcategoría», tuteo en el formulario, «Ecoproductos», «limón Tahití», «Meses de mentoría y seguimiento», nombre del fundador sin repetir, entre otras.
- Se quitó la sección «Impacto colectivo» (y la cifra de Eureka).
- Blog «Lo último del programa»: fotos sin velo gris (degradado solo abajo) y cada tarjeta abre su momento completo.
- Categorías de negocios verdes: etiqueta «Ver imagen completa», cursor de lupa y ampliación con cierre fácil en celular.
- Etapas con un ícono por fase (provisionales).
- Contadores animados que siempre llegan al valor real.
- `ruta.html` se titula «Así fue la edición 4.0»; el cronograma 5.0 sale de la base en Convocatoria.
- Contenido editable desde el panel y leído por el sitio (`sitio-datos.js`): fotos del inicio, momentos, etapas y resultados (en Nosotros). Si la base no responde, cada página muestra su contenido original.
- Los momentos se filtran antes de mostrarse (no puede colarse código) y las entradas `[PRUEBA]` no aparecen en las listas públicas.
- Analítica propia sin cookies (`api/track.js`, solo funciona en Vercel).

### Formulario de postulación (`postular.html`)
- Conectado a Supabase: guarda todas las respuestas, sube cédula, RUT y recibo de Triple A a un espacio privado y avisa por correo.
- Redes sociales: de 1 a 3 con selector, `@usuario` convertido en enlace, página web opcional.
- Las 12 mejoras del informe: borrador automático con progreso por sección, ventas en COP y ganancias por rangos, colaboradores vacío y obligatorio, resumen de pendientes con enlaces, contador de ODS con bloqueo de la cuarta, ayuda emprendimiento verde / negocio verde, contadores y límites de caracteres, mayoría de edad, nombre y tamaño del archivo con reemplazar y quitar, video solo YouTube, Drive o Vimeo, validación del documento según el tipo.
- Enlaces a los términos de referencia y a la política de datos, abiertos en pestaña nueva.
- Sin contraseña: las cuentas se crean solo para ganadores autorizados. Mensaje de confirmación definitivo.

### Base de datos y seguridad (Supabase)
Migraciones aplicadas en producción (`supabase/migrations/`):
- `20260930120000` columnas del formulario, bucket privado `postulaciones`.
- `20260930130000` roles evaluador / editor / administrador, calificación con rúbrica, puntaje de la plataforma, ranking, pesos, correos enviados, analítica, bucket de imágenes, cursos por módulos y visibilidad, íconos de etapas.
- `20260930140000` un visitante ya no puede enviarse como «ganador» ni asignarse cuenta.
- `20260930150000` funciones internas cerradas a la API pública.
- `20260930160000` las cuentas nuevas nacen «pendiente» (sin acceso), límites de tamaño en lo que envía el público y rutas de adjuntos restringidas.

Fallas de seguridad encontradas y corregidas en la auditoría: envío como ganador, registro abierto con acceso a cursos, campos sin tope, adjuntos con cualquier nombre, funciones internas expuestas, «Quitar acceso» que dejaba a la persona como beneficiario.

### Panel de administración (`admin.html`, reescrito)
- Tres roles: **administrador** (todo), **editor** (contenido web y cursos) y **evaluador** (solo califica, con la entidad Inngenios o Triple A).
- **Participantes y ranking:** puntaje de la plataforma (P, máx. 83), Inngenios (I), Triple A (A) y global (0,40·P + 0,30·I + 0,30·A, pesos editables); «parcial» con lo que falta, empates con orden y nota de desempate, aviso si I y A difieren en más de 25 puntos, posible duplicada, ficha con respuestas, redes como enlaces y adjuntos con enlace temporal, exportación CSV.
- **Calificar:** rúbrica de cuatro criterios (1 a 5) con las descripciones del informe; cada evaluador no ve la nota del otro.
- **Autorizar ganador y enviar acceso:** crea la cuenta de beneficiario y envía un enlace para crear la contraseña (nunca la contraseña).
- **Momentos:** editor visual, subida de imagen con texto alternativo, vista previa, borrador local si se cierra la sesión, fechas en hora de Colombia, empieza siempre como borrador.
- **Cursos:** por módulos, vista previa, «Ver curso publicado», quién lo ve (todos, cohorte o emprendimiento).
- Fotos del inicio, etapas (con ícono), resultados, analítica real con filtro de fechas, registro de correos con reenvío, equipo y accesos, pesos del puntaje, ayuda y búsqueda.
- Módulo de **Seguimiento** como flujo y maqueta para aprobación del equipo (lo que pide el informe antes de construirlo).

### Correos y área del beneficiario
- Función `correos` desplegada: aviso al programa (con puntaje y enlace a la ficha), confirmación al postulante (resumen y cronograma, sin credenciales), bienvenida al ganador e invitación al equipo.
- Remitente `Innova Social <hola@inngenios.co>`; avisos a `hola@inngenios.co`; la clave de Resend ya está en Supabase.
- `acceso.html` (crear contraseña, entrar, recuperar), `mis-cursos.html` y `curso.html` para beneficiarios.

### Pruebas
- 110 comprobaciones de permisos en producción (visitante, admin, editor, evaluadores, beneficiario, cuenta pendiente): 110 / 110.
- 3 postulaciones reales de prueba con adjuntos: guardadas y con puntaje correcto.
- 34 comprobaciones de la lógica de correos y 12 del rastreo de visitas.
- Panel completo probado con una base simulada en el navegador.

---

## 2. Lo que falta

### Bloquea el envío de correos
1. **Cargar 4 registros DNS en GoDaddy** (`resend._domainkey`, `rsend`, `send` y opcional `_dmarc`) y verificar el dominio en Resend. Lo hace quien tenga acceso a GoDaddy. Sin esto, los correos fallan con «dominio no verificado».
2. Con el dominio verificado: reenviar los correos fallidos y probar el flujo completo.

### Ajustes en el panel de Supabase (solo el dueño del proyecto)
- Desactivar **Allow new users to sign up** (hoy el registro público está abierto).
- Permitir las direcciones de retorno `https://innova-eta.vercel.app/acceso.html` y `http://localhost:4173/acceso.html` en Authentication → URL Configuration. Sin esto no funcionan los enlaces de «Crear mi contraseña».
- Activar **Leaked password protection** (puede requerir plan Pro).
- Cuando el dominio esté verificado: Authentication → SMTP con Resend, para que «¿Olvidaste tu contraseña?» salga del dominio del programa.

### Prueba con sesión real del administrador
- Crear el usuario del otro administrador (Supabase → Authentication → Users → Add user, con «Auto Confirm») y agregar su correo a la lista de administradores. Cristian ya es admin.
- Correr el flujo completo en el panel real: ver la postulación con adjuntos, invitar a los evaluadores de prueba de Inngenios y de Triple A, calificar, desempate, autorizar a un ganador, bienvenida por correo, subir un curso de prueba con archivos.
- Borrar los datos de prueba: 3 postulaciones `[PRUEBA]` con 9 adjuntos y 6 registros de correo. No se creó ninguna cuenta; el único usuario es el de Cristian.

### Publicación
- **Desplegar en Vercel producción.** El sitio publicado sigue en la versión anterior; la analítica y los enlaces de los correos dependen de esto. Requiere confirmación.
- Si se usa un dominio propio (por ejemplo el de Hostinger): agregarlo en Vercel, cargar el DNS, y actualizar `SITE_URL` y las direcciones de retorno.

### De otras personas o decisiones del equipo
- **Diana:** logo 5.0 (el correo y el encabezado hoy llevan la marca en texto o 4.0) y los seis íconos finales de las etapas.
- **WhatsApp:** la confirmación por WhatsApp que pide el informe necesita una cuenta de WhatsApp Business (Meta o Twilio). Hoy solo se confirma por correo.
- **Seguimiento por emprendimiento:** aprobar el flujo y la maqueta antes de construirlo (fases y entregables, mentor, informe para Triple A, soportes del plan de inversión).
- **Pesos del puntaje** (40 / 30 / 30 por defecto), si la población priorizada suma puntos y si «Ninguna» formalización suma 0.
- **Cronograma 5.0** definitivo y su fecha del Pitch Day.
- **Contenido por aclarar (C1–C6 del informe):** 6 o 9 meses de acompañamiento; nombre comercial de «Manteca de Cerdo»; «1,6 toneladas» mensual o única; facturas en los requisitos; fecha del momento «De camino al Pitch Day» (dice 23 ene 2026 y el Pitch Day fue el 28–29 nov 2025); cifras que no coinciden entre el inicio ($95.705.000 y 87 %) y los casos ($99.888.140 y 66 %).
- **URL pública del informe** para el botón «Descargar Informe Innova Social 2025» de `casos.html` (hoy apunta a `#`).

### Mejoras sugeridas (no bloquean)
- Si Resend falla al enviar la postulación no se reintenta solo; hay que reenviar desde «Correos enviados».
- Al borrar una postulación sus adjuntos quedan en el almacenamiento; el panel no ofrece borrar postulaciones.
- Un límite de envíos por visitante en el formulario público (hoy solo hay topes de tamaño).

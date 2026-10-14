# Auditoría del backend — Innova Social 5.0

Actualizado: 14 oct 2026 (primera versión: 1 oct) · Proyecto Supabase `yivyqorgcagwykedngjv` · Sitio: https://convocatoria.innovasocial.co

Leyenda: ✅ verificado · 🟡 hecho, falta una prueba o algo que no depende del código · ⛔ bloqueado por una acción externa · ❓ decisión del equipo.

## 1. Cómo se probó

No hay cuentas de prueba en producción y no se crean ni se usan las reales, así que la prueba tiene dos capas.

| Capa | Qué se hizo | Resultado |
|---|---|---|
| Permisos y lógica en producción | `supabase/tests/permisos.sql`: 70 comprobaciones en una transacción que se deshace, suplantando a cada rol (visitante, administrador con y sin jurado, editor, evaluadores, evaluador sin jurado, cuenta pendiente, beneficiario) | 70 / 70 (13 oct) |
| Pantallas, de punta a punta | Sitio en localhost con `sw-simulado.js`, un backend simulado en el navegador con los mismos permisos por rol y el mismo cálculo del ranking. Login real con cuentas de prueba locales | ✅ los 6 roles; 48 capturas en `docs/flujo-e2e/` |
| Formulario publicado | 8 oct: postulación real en el sitio con archivos sin tipo declarado y extensión en mayúsculas | ✅ guardada con documentos y puntaje; aviso al programa enviado; borrada después |
| Función de correos | Lógica revisada contra la tabla de jurados; desplegada el 14 oct con `SITE_URL` correcto | 🟡 falta el envío real de una bienvenida de ganador |
| Rastreo de visitas | `api/track.js` con 12 casos (dispositivos, bots, datos malos) y registro de errores | ✅ |

**Límite de la capa simulada:** arma los enlaces de los correos con la dirección local, así que no puede detectar errores de dominio en `SITE_URL`. Así se pasó por alto el hallazgo 9 hasta el 14 oct.

Para repetir la batería:

```bash
supabase db query --linked -o json -f supabase/tests/permisos.sql
```

## 2. Hallazgos (todos corregidos)

| # | Hallazgo | Corrección |
|---|---|---|
| 1 | Un visitante podía enviarse como «ganador», con cuenta asignada o con orden de desempate | Migración `20260930140000` |
| 2 | Cualquiera podía crear una cuenta y nacía como beneficiario, con acceso a cursos | `20260930160000`: las cuentas nacen «pendiente» |
| 3 | Campos sin tope de tamaño y adjuntos con cualquier nombre | `20260930160000`: límites por campo, máximo 3 redes, rutas `<id>/cedula\|rut\|recibo_triple_a.<pdf\|jpg\|jpeg\|png>` |
| 4 | Funciones internas llamables desde la API pública | `20260930150000` |
| 5 | «Quitar acceso» dejaba a la persona como beneficiario | Ahora la deja «sin acceso» |
| 6 | El ranking entero fallaba (error 22P02) si unas ventas venían como texto («$1.800.000 / mes») | `20261005120000` / `20261006120000`: `ventas_a_numero()` |
| 7 | El bucket `postulaciones-docs` aceptaba subidas anónimas sin restricción | `20261006120000` |
| 8 | Archivos sin tipo declarado (PDF de Windows, `.jfif`) hacían fallar la postulación | `postular.html` toma el tipo del archivo |
| 9 | `SITE_URL` de la función de correos apuntaba a `innovasociall.co`, un dominio que no existe: los enlaces «Crear mi contraseña», «Ver ficha» e invitación no abrían | 14 oct: secreto cambiado a `https://convocatoria.innovasocial.co` y valor por defecto del código corregido |
| 10 | Tras pasar a jurados configurables, la función de correos rechazaba invitar evaluadores (`jurado_1` / `jurado_2`) | Valida contra la tabla `jurados` |
| 11 | Un admin solo podía calificar como el jurado de su cuenta y la nota quedaba a nombre de la cuenta | `20261013120000`: cualquier admin califica como cualquier jurado declarando quién califica; queda también la cuenta que la registró |
| 12 | El sello del calificador sobrescribía `evaluador_id` al editar desde el editor SQL | El trigger respeta la fila cuando no hay sesión |

**Pendiente del dueño del proyecto en el panel de Supabase** (no cambio ajustes de seguridad desde aquí):
- Authentication → URL Configuration → permitir `https://convocatoria.innovasocial.co/acceso.html`. ⛔ Sin esto no funciona el enlace para crear la contraseña.
- Authentication → Sign In / Providers → desactivar **Allow new users to sign up**. Comprobado el 14 oct: sigue abierto.
- Authentication → Password security → **leaked password protection** (puede requerir plan Pro).
- Authentication → SMTP → Resend, para que «¿Olvidaste tu contraseña?» salga del dominio del programa.

## 3. Informe de pruebas — punto por punto

### Redes sociales
| Criterio | Estado |
|---|---|
| Primera red con selector; «+ Agregar otra red» hasta 3; cada red se puede quitar | ✅ |
| «Página web (opcional)» no bloquea | ✅ |
| Valida URL y convierte `@usuario` en enlace de la red elegida | ✅ (`@raizcostena` → `instagram.com/raizcostena`) |
| Panel: redes y web como enlaces en la ficha y en la exportación | ✅ |

### 12 mejoras del formulario
| # | Mejora | Estado |
|---|---|---|
| 1 | Borrador automático + barra de progreso por sección | ✅ |
| 2 | Ventas numérico en COP; ganancias por rangos | ✅ |
| 3 | Colaboradores vacío, obligatorio, mínimo 0 | ✅ |
| 4 | 5.0 en todas las páginas | ✅ |
| 5 | Resumen de pendientes con enlace a cada campo | ✅ |
| 6 | Contador de ODS y bloqueo de la cuarta | ✅ |
| 7 | Ayuda emprendimiento verde vs. negocio verde | ✅ |
| 8 | Contadores y límites de caracteres | ✅ |
| 9 | Validar mayoría de edad | ✅ |
| 10 | Nombre, tamaño, reemplazar y quitar archivo | ✅ y archivos sin tipo declarado |
| 11 | Video solo YouTube, Drive o Vimeo | ✅ |
| 12 | Documento según tipo | ✅ |

### Modelo de puntaje
| Requisito | Estado |
|---|---|
| P: 11 reglas, máximo 83, escala 0–100 | ✅ idéntico en SQL y en el panel; ventas en texto incluidas |
| Dos jurados, 4 criterios de 1 a 5 | ✅ jurados configurables: «Inngenios (Jurado 1)» y «Triple A (Jurado 2)» |
| Quién califica | ✅ evaluador: su cuenta; administrador: cualquier jurado, con nombre y correo declarados |
| Un evaluador no ve la nota del otro jurado | ✅ (RLS en producción) |
| Global = 0,40·P + 0,30·J1 + 0,30·J2 (ejemplo del informe = 85) | ✅ |
| «Parcial» con lo que falta; ranking; empates con nota | ✅ |
| Jurados difieren > 25 → revisar en conjunto | ✅ |
| Posible duplicada (mismo documento o correo) | ✅ |
| Pesos 40/30/30, población priorizada, «Ninguna» formalización | ❓ pesos editables; población no suma; «Ninguna» = 0 |

### Página pública (ajustes 1–6)
| # | Estado |
|---|---|
| 1 Quitar «Impacto colectivo» / Eureka | ✅ |
| 2 Fotos del blog sin filtro | ✅ — las 3 portadas que daban 404 se pasaron al bucket `momentos` (14 oct) |
| 3 Imagen de categorías: ampliar y cerrar | ✅ |
| 4 Íconos en las etapas | ✅ íconos oficiales de marca |
| 5 Enlaces TDR y política en nueva pestaña | ✅ |
| 6 Formulario y confirmación en 5.0 | ✅ |

### Panel de administración (ajustes 7–13)
| # | Requisito | Estado |
|---|---|---|
| 7 | Analíticas con datos reales y filtro de fechas | ✅ eje con marcas redondas |
| 8 | Todas las secciones y la búsqueda | ✅ recorridas con los 6 roles en el simulador; 🟡 falta una corrida con sesión real |
| 8 | Evaluadores de Inngenios y Triple A | ⛔ aún no hay evaluadores invitados en producción |
| 9 | Postulación guardada con respuestas y adjuntos | ✅ en producción (8 oct) |
| 9 | Aparece de inmediato en Participantes, con fecha y hora | ✅ |
| 9 | Confirmación por correo | ✅ aviso al programa enviado el 8 oct; 🟡 falta probar la confirmación a un correo real |
| 9 | Confirmación por WhatsApp | ❓ requiere WhatsApp Business |
| 9 | Credenciales solo a ganadores autorizados | ✅ enlace para crear contraseña; ⛔ falta permitir la dirección en Supabase |
| 10 | Momentos: sesión, fecha de Colombia, borrador, editor visual, imagen | ✅ y el código inyectado se filtra |
| 11 | Cursos por módulos, vista previa, quién lo ve | ✅ la beneficiaria ve solo sus cursos; un curso ajeno por URL dice «no disponible» |
| 12 | Seguimiento por emprendimiento | ❓ la maqueta se retiró del panel; falta decidir el flujo |
| 13 | Correos: aviso, confirmación, bienvenida; registro con estado y reenvío | ✅ |
| 13 | Correos con la imagen de Innova Social 5.0 | 🟡 cabecera con la marca en texto |

### Ortografía y contenido
- Cambios a 5.0 y correcciones B1–B13: ✅.
- C7 (ruta 4.0 y cronograma 5.0 desde la base) ✅ · C8 (contadores) ✅ · C9 (tarjetas abren su momento) ✅.
- ❓ Decisiones del equipo: C1 (6 o 9 meses), C3 (nombre de «Manteca de Cerdo»), C4 (1,6 t por mes), C5 (facturas), C6 (fecha del momento «De camino al Pitch Day»), cifras $95.705.000 / 87 % frente a $99.888.140 / 66 %.

## 4. Otros hallazgos
- `casos.html`: el botón «Descargar Informe Innova Social 2025» sigue apuntando a `#`.
- El historial de migraciones remoto no registra 5 versiones locales (`20261001120000`, `20261002130000`, `20261002160000`, `20261005120000`, `20261009120000`); sus cambios sí están en producción. No usar `supabase db push`.
- Producción, 14 oct: 0 postulaciones, 0 correos, 1 administrador, 0 evaluadores, 0 beneficiarios, 1 curso, 4 momentos publicados. Sin datos de prueba.

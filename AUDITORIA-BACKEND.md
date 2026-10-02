# Auditoría del backend — Innova Social 5.0

Fecha: 1 oct 2026 · Proyecto Supabase `yivyqorgcagwykedngjv` · Sitio local contra producción.

Leyenda: ✅ verificado · 🟡 hecho, falta algo que no depende del código · ⛔ bloqueado por una acción externa · ❓ decisión del equipo.

## 1. Cómo se probó

| Capa | Qué se hizo | Resultado |
|---|---|---|
| Permisos y datos en producción | 110 comprobaciones en una transacción que se deshace, suplantando cada rol (visitante, administrador, editor, evaluador de Inngenios, evaluador de Triple A, evaluador sin entidad, beneficiario, cuenta pendiente) | 110 / 110 |
| Formulario real | 3 envíos `[PRUEBA]` desde `postular.html` a producción, con adjuntos, redes y archivos de hasta 3 MB | ✅ guardados con adjuntos y puntaje correcto |
| Función de correos | 34 comprobaciones con base y Resend simulados (avisos, confirmación, ganador, equipo, reenvío, permisos, escape de HTML) + 11 llamadas reales a producción | 34 / 34 y respuestas esperadas |
| Rastreo de visitas | Handler `api/track.js` con 12 casos (dispositivos, bots, datos malos) | ✅ |
| Panel (`admin.html`) | Todas las secciones y botones con 3 roles, contra una base simulada en el navegador | ✅ — **falta la corrida con sesión real** |
| Área del beneficiario | `acceso.html`, `mis-cursos.html`, `curso.html` con base simulada | ✅ |
| Seguridad automática | `supabase db advisors` + sondeos HTTP anónimos | hallazgos abajo |

## 2. Hallazgos de seguridad (corregidos)

1. **Un visitante podía enviarse como «ganador»**, con cuenta asignada o con orden de desempate. → Migración `20260930140000`.
2. **Cualquiera podía crear una cuenta** (el registro público de Supabase está abierto) y esa cuenta nacía como beneficiario, con acceso a los cursos de «todos los beneficiarios». → Migración `20260930160000`: las cuentas nacen «pendiente» (sin acceso) y solo pasan a beneficiario al autorizar al ganador.
3. **Campos sin tope de tamaño** en lo que envía el público, y adjuntos con cualquier nombre. → Misma migración: límites por campo, máximo 3 redes, y rutas de adjuntos limitadas a `<id>/cedula|rut|recibo_triple_a.<pdf|jpg|jpeg|png>`.
4. Funciones internas (`handle_new_user`, `promote_to_beneficiario`, `analitica_resumen`) llamables desde la API pública. → `20260930150000`.
5. «Quitar acceso» en el panel dejaba a la persona como beneficiario. → ahora la deja «sin acceso».

**Pendiente tuyo en el panel de Supabase** (yo no cambio ajustes de seguridad):
- Authentication → Sign In / Providers → desactivar **Allow new users to sign up**. (La invitación de ganadores y del equipo sigue funcionando.)
- Authentication → URL Configuration → permitir `https://innova-eta.vercel.app/acceso.html` y `http://localhost:4173/acceso.html`.
- Authentication → Password security → activar **leaked password protection** (puede requerir plan Pro).
- Cuando el dominio esté verificado: Authentication → SMTP → usar Resend, para que el correo de «¿Olvidaste tu contraseña?» salga del dominio del programa y no del remitente genérico de Supabase (que además está limitado a pocos correos por hora).

## 3. Informe de pruebas — punto por punto

### Redes sociales
| Criterio | Estado |
|---|---|
| Primera red opcional con selector (Instagram, Facebook, TikTok, LinkedIn, YouTube, X, otra) | ✅ |
| «+ Agregar otra red» hasta 3; se oculta al llegar a 3 | ✅ |
| Cada red adicional se puede quitar | ✅ |
| «Página web (opcional)» no bloquea | ✅ |
| Valida URL y convierte `@usuario` en enlace de la red elegida | ✅ (probado en producción: `@tres_negocio` → `instagram.com/tres_negocio`) |
| Panel: redes y web como enlaces en la ficha y en la exportación | ✅ ficha con enlaces; CSV con texto legible |

### 12 mejoras del formulario
| # | Mejora | Estado |
|---|---|---|
| 1 | Borrador automático + barra de progreso por sección | ✅ guarda, recupera y avisa |
| 2 | Ventas numérico en COP; ganancias por rangos | ✅ |
| 3 | Colaboradores vacío, obligatorio, mínimo 0 | ✅ |
| 4 | 5.0 en todas las páginas | ✅ |
| 5 | Resumen de pendientes con enlace a cada campo; sección en rojo | ✅ |
| 6 | Contador de ODS y bloqueo de la cuarta | ✅ (3 / 3 y la cuarta queda bloqueada; al quitar una se libera) |
| 7 | Ayuda emprendimiento verde vs. negocio verde | ✅ |
| 8 | Contadores y límites de caracteres (150–600, 150–600, 200–800, 100–400, 150–600) | ✅ y el envío se bloquea por debajo del mínimo |
| 9 | Validar mayoría de edad | ✅ «Debes ser mayor de edad…» |
| 10 | Nombre, tamaño, reemplazar y quitar archivo; rechaza `.exe` y más de 10 MB | ✅ |
| 11 | Video solo YouTube, Drive o Vimeo | ✅ |
| 12 | Documento según tipo (cédula 6–10 dígitos, solo números) | ✅ |

### Modelo de puntaje
| Requisito | Estado |
|---|---|
| P: 11 reglas, máximo 83, escala 0–100 | ✅ idéntico en SQL y en el panel; ejemplo del informe verificado |
| I y A: 4 criterios de 1 a 5, cada evaluador sin ver la nota del otro | ✅ (RLS probada en producción) |
| Descripciones de la rúbrica visibles al evaluador | ✅ |
| Global = 0,40·P + 0,30·I + 0,30·A (ejemplo del informe = 85) | ✅ |
| Puntaje visible por actor (P, I, A, global), en tiempo real | ✅ |
| «Parcial» e indica qué calificación falta | ✅ |
| Ranking de mayor a menor | ✅ |
| I y A difieren > 25 → marca para revisar en conjunto | ✅ |
| Empates señalados; orden acordado y nota de la decisión | ✅ |
| Posible duplicada (mismo documento o correo) | ✅ añadido en esta auditoría |
| Pesos 40/30/30, población priorizada, «Ninguna» formalización | ❓ pesos editables en el panel; población no suma; «Ninguna» = 0 |

### Página pública (ajustes 1–6)
| # | Estado |
|---|---|
| 1 Quitar «Impacto colectivo» / Eureka | ✅ sección eliminada |
| 2 Fotos del blog sin filtro; degradado solo abajo | ✅ |
| 3 Imagen de categorías: etiqueta, lupa, ampliar y cerrar | ✅ |
| 4 Íconos en las etapas | 🟡 seis íconos provisionales en el estilo del sitio; faltan los de Diana |
| 5 Enlaces TDR y política abiertos en nueva pestaña | ✅ |
| 6 Formulario y confirmación en 5.0, mensaje definitivo, ícono sin rectángulo | ✅ |

### Panel de administración (ajustes 7–13)
| # | Requisito | Estado |
|---|---|---|
| 7 | Analíticas: sin desborde, datos reales, filtro de fechas, totales coherentes | ✅ el SQL usa un solo conjunto de filas; el contador real empieza al publicar en Vercel |
| 8 | Momentos, Inicio, Participantes, Cursos, Resultados, Convocatoria, Sliders, Ayuda, búsqueda | ✅ en simulador y por permisos reales; ⛔ falta la corrida con sesión real |
| 8 | Usuarios de prueba: evaluador de Inngenios y de Triple A | ⛔ se invitan desde el panel (Equipo y accesos) con un administrador |
| 8 | «Entra con tu cuenta del equipo…» | ✅ |
| 9 | Postulación guardada con todas las respuestas y adjuntos | ✅ en producción |
| 9 | Aparece de inmediato en Participantes, con fecha y hora de envío | ✅ (hora de Bogotá); ⛔ con sesión real |
| 9 | Confirmación por correo | ⛔ la clave de Resend ya está, falta verificar el dominio (DNS en GoDaddy) |
| 9 | Confirmación por WhatsApp | ❓ requiere cuenta de WhatsApp Business; hoy solo correo |
| 9 | Credenciales solo a ganadores autorizados | ✅ (enlace para crear contraseña, nunca la contraseña) |
| 9 | Prueba de punta a punta con evidencia | 🟡 lado público y base ✅; falta el lado del panel con sesión real |
| 10.1 | Sesión que se cierra no pierde lo escrito | ✅ renovación automática, copia local y aviso al cerrar |
| 10.2 | Fecha en hora de Colombia | ✅ en panel y sitio |
| 10.3 | Sin selector de estado; empieza como borrador | ✅ |
| 10.4 | Editor visual con vista previa | ✅ |
| 10.5 | Subir imagen, miniatura, texto alternativo | ✅ |
| 11 | Cursos por módulos, vista previa, «Ver curso publicado», quién lo ve | ✅ permisos en producción; 🟡 falta probar la subida de archivos con sesión real |
| 11 | «con Claude» | ✅ corregido en la base |
| 12 | Seguimiento por emprendimiento | 🟡 flujo y maqueta para aprobación (como pide el informe) |
| 13 | Correos: aviso, confirmación, bienvenida; sin credenciales al postular | ✅ lógica completa (34 / 34); ⛔ envío real hasta verificar el dominio |
| 13 | Registro de cada correo con estado y reenvío | ✅ (ya quedó el error real de Resend registrado) |
| 13 | Correos con la imagen de Innova Social 5.0 | 🟡 cabecera con la marca en texto; falta el logo 5.0 de Diana |
| 13 | Texto «el registro de tu cuenta es a la vez tu postulación» | ✅ retirado |

### Ortografía y contenido
- Cambios a 5.0 (sección A) y correcciones B1–B13: ✅ todas verificadas en el código.
- C7 (ruta «Así fue la edición 4.0», cronograma 5.0 desde la base) ✅ · C8 (contadores) ✅ · C9 (tarjetas abren su momento) ✅.
- ❓ Decisiones del equipo: C1 (6 o 9 meses), C3 (nombre de «Manteca de Cerdo»), C4 (1,6 t por mes), C5 (facturas en los requisitos), C6 (fecha del momento «De camino al Pitch Day»: dice 23 ene 2026 y el Pitch Day fue el 28–29 nov 2025), cifras $95.705.000 / 87 % frente a $99.888.140 / 66 %.

## 4. Otros hallazgos
- `casos.html`: el botón «Descargar Informe Innova Social 2025» apunta a `#` (viene de un commit anterior). Falta la URL pública del informe.
- La clave de Resend responde bien; el único error es «dominio no verificado», y queda registrado en «Correos enviados».
- Si Resend falla al enviar la postulación, no se reintenta solo: hay que reenviar desde el panel.
- El sitio en Vercel sigue en la versión anterior: nada de esto está desplegado. Falta confirmación para publicar.
- Datos de prueba que quedan en producción (se borran al terminar la prueba con sesión real): 3 postulaciones `[PRUEBA]` con sus 9 adjuntos y 6 correos en el registro. No se creó ninguna cuenta: hay 1 usuario en total, el de Cristian.

# Banco de pruebas de roles

Levanta un Postgres real (PGlite, Postgres compilado a WASM) sin Docker ni sudo,
aplica las migraciones de `supabase/migrations/` desde cero y recorre el flujo
completo rol por rol con RLS de verdad.

Existe porque probar permisos contra una base simulada no prueba nada: lo que hay
que verificar es justamente que un jurado no vea la nota del otro, y eso lo decide
Postgres, no el navegador.

## Correr

```bash
cd pruebas && npm install
node flow.js      # matriz de flujo y permisos (28 comprobaciones)
node ataques.js   # pase adversarial: intenta romper el modelo
node fixtures.js  # exporta lo que ve cada rol a fixtures.json
node auto.js      # abre el panel real como cada rol y captura (necesita `npx serve -l 4180`)
```

## Las seis cuentas

| Persona | Correo | Rol | Jurado |
|---|---|---|---|
| Ana Admin | admin@example.com | admin | — |
| Elena Editora | editor@example.com | editor | — |
| Julio Jurado Uno | jurado1@example.com | evaluador | jurado_1 |
| Julia Jurado Dos | jurado2@example.com | evaluador | jurado_2 |
| Beto Beneficiario | beneficiario@example.com | beneficiario | — |
| Pedro Pendiente | pendiente@example.com | pendiente | — |

Son de `example.com` a propósito: nunca deben existir en producción.

## Cómo se simula una sesión

`db.js` expone `as(db, persona, sql)`, que abre una transacción, hace
`set local role authenticated` y fija `request.jwt.claim.sub`, igual que hace
Supabase con un JWT. Al terminar hace `rollback`, así que las comprobaciones no
dejan rastro. `asCommit` es la variante que sí conserva (para sembrar).

## Trampa conocida

`bootstrap.sql` reproduce lo que Supabase trae de fábrica. Si faltan los `grant`
a `anon`/`authenticated`, **todo** falla con `permission denied` y la matriz
parece decir que RLS bloquea cuando en realidad bloquea el GRANT. Los grants se
aplican en `db.js` después de las migraciones, por eso.

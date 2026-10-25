# ADR 0007 — Margen de gracia en la rotación del refresh token

- **Estado:** aceptado (2026-10-25)
- **Migración:** `backend/prisma/migrations/*_refresh_token_replaced_at`

## Contexto

Cada `POST /api/auth/refresh` rota el refresh token, y reutilizar un token ya rotado se trata como robo
(se revoca toda la familia del usuario). Las pruebas E2E (T3.3) demostraron un falso positivo determinista:
si el navegador recarga mientras la restauración de sesión está en vuelo, el servidor rota el token pero
el navegador nunca guarda la cookie nueva. La siguiente carga reenvía la anterior y el usuario acaba en
`/login`. Lo mismo ocurre con varias pestañas que restauran sesión a la vez.

## Decisión

- Nueva columna `refresh_tokens.replacedAt`: se rellena **solo** cuando un token se revoca por rotación
  (no por logout, cambio de rol/contraseña/desactivación ni detección de robo).
- Si llega un token revocado con `replacedAt` hace ≤ **30 s** y el usuario aún tiene un token activo emitido
  desde la rotación (el sucesor "perdido"), se considera benigno: se revoca ese sucesor y se emite una sesión
  nueva. Así nunca hay dos sesiones vivas de la misma cadena.
- En cualquier otro caso (fuera del margen, revocado por logout, sucesor ya cerrado) se mantiene la
  revocación de toda la familia.

## Consecuencias

- Un atacante que robe un refresh token y lo use en menos de 30 s tras una rotación legítima obtendría
  sesión, pero a costa de invalidar la del usuario, que verá que se cerró. Fuera de esa ventana la detección
  de robo es la misma de antes.
- Tolerancia de 5 s entre el reloj de la app (`replacedAt`) y el `DEFAULT now()` de la BD (`createdAt`).
- Cubierto por tests unitarios (identity), de integración (`auth.int.test.ts`) y E2E (`session-race.spec.ts`).

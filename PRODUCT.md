# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Ejecutivos comerciales:** gestionan una cartera rotativa de ~60 empresas por ciclo de 3 semanas, con un mínimo de 20 contactos por semana. Trabajan sobre todo en escritorio (portátil/monitor) en oficina; el móvil es para consultas puntuales.
- **Supervisores:** siguen la cobertura y el cumplimiento de cuota de su equipo, reasignan cuentas.
- **Administradores:** importan el Excel fuente, gestionan usuarios y ejecutan la rotación semanal.

## Product Purpose

CRM de seguimiento comercial sobre ~127 000 empresas de Nicaragua. Organiza el trabajo en carteras rotativas: las empresas sin avance vuelven al pool al cerrar el ciclo. Éxito = cada ejecutivo cumple su plan semanal y la cobertura del ciclo crece sin que se pierdan cuentas.

## Positioning

La cartera rotativa con ciclos de 3 semanas y cuota semanal es el mecanismo central: no es un CRM genérico de contactos, es un sistema de distribución y rotación de un universo grande de empresas.

## Operating Context

Uso diario en jornada de oficina. Flujos principales: Mi semana (plan de contactos), Pipeline kanban de 8 estados, Empresas (búsqueda por RUC, razón social, nombre comercial, ignora tildes), Cartera (ciclos, asignación, liberación), Citas, Contratos, Tablero de indicadores, Importación (ADMIN), Usuarios (ADMIN).

## Capabilities and Constraints

- Stack: React 19, Vite 7, Tailwind CSS 4, TanStack Router/Query/Table, Radix UI, lucide-react, recharts. Interfaz en español (es-NI), zona horaria America/Managua.
- Volumen grande: toda lista, tabla, columna del pipeline, selector/combobox y el plan de Mi semana debe ir paginada y con buscador (requisito del usuario, 2026-10-25).
- Tema claro por defecto y tema oscuro equivalente con la misma paleta; el selector de tema se mantiene.
- Roles: ADMIN, SUPERVISOR, EJECUTIVO.

## Brand Commitments

- Nombre: AXIOM CRM.
- Logo: símbolo plateado/metálico de una "A" unida a un infinito, con un destello azul eléctrico (`frontend/public/brand/axiom-logo.png`).

## Evidence on Hand

- Datos reales en `data/` (ignorado por git, contiene datos personales). En tests y demos solo datos ficticios.
- No hay testimonios, clientes ni métricas públicas; no inventarlos.

## Product Principles

1. La cuota semanal y la cobertura del ciclo están siempre a la vista del ejecutivo.
2. Encontrar una empresa entre 127 000 debe ser inmediato: búsqueda en todas partes.
3. Ninguna vista carga listas sin límite: paginación siempre.
4. Las reglas de rotación son explícitas; el sistema explica por qué una cuenta sale o entra.

## Accessibility & Inclusion

WCAG 2.2 AA: contraste, navegación por teclado, `aria-live` en resultados de búsqueda y paginación (ya presente en el componente actual).

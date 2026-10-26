---
version: 1
slug: "frontend-src-app-layout-app-layout-tsx"
primary_target: "frontend/src/app/layout/app-layout.tsx"
related_targets: ["frontend/src"]
---

# App shell — AXIOM CRM (Operate)

Scope: all authenticated screens plus login. Visitor mode: Operate. Ejecutivos, supervisores y admins en escritorio; tarea = cumplir el plan semanal y mover empresas por el pipeline. Constraint: paginación y buscador en toda lista, columna, selector y en Mi semana.

## Direction contract

THESIS: A light, cool workspace where rotation progress is always legible; refuses the dark navy admin shell and the grey-card SaaS kit.
OWN-WORLD: Ground #F4F6FA, white surfaces, ink #101828, line #E4E8F0, one accent Axiom blue #2A62F2 from the logo's glow; Onest with tabular numerals; rounded-xl surfaces with soft offset shadows; light sidebar with raised white active pill; dark mode mirrors it on #0C111D.
STORY: The ejecutivo sees quota and cycle state first, finds any company in seconds by search, and pages through every list without a wall of rows.
FIRST VIEWPORT: Left 256px light rail with logo, grouped nav, dark-mode switch; 64px topbar with section path, today's date, user; content with header (title left, primary action right), then the screen's data.
FORM: user-pinned (Vectra reference); signature move = the ghost track: blue fill fading over a pale full-height track for quota, coverage, charts and the 21-day cycle. seed: none (unavailable)
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

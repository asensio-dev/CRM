# Changelog

Todos los cambios notables de AXIOM CRM se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el versionado sigue [SemVer](https://semver.org/lang/es/).

## [Sin publicar]

### Añadido

- **Departamento de cada empresa:** nueva columna `companies.department` (17 departamentos y regiones de Nicaragua) deducida de las direcciones de envío y particular —departamentos, municipios, puntos de referencia y kilómetros de las carreteras de Managua— y, si no hay pistas, del prefijo del teléfono fijo. La importación la calcula en cada carga y `bun run db:backfill:departments` la rellena para toda la base (`--dry-run` para simular).
- **Listado de clínicas dentales:** `bun run db:export:dental` exporta a `data/clinicas-dentales.xlsx` todas las clínicas dentales (actividad odontológica o nombre con DENTAL/ODONTO/ORTODON) con su departamento y un resumen por departamento.

## [1.0.0] - 2026-10-25

Primera versión de producción. CRM de seguimiento comercial sobre unas 127 000 empresas de Nicaragua, con carteras rotativas de 3 semanas por ejecutivo, pipeline de 8 estados con reglas automáticas, citas, contratos y tablero de indicadores. Validada con los datos reales en un entorno QA tipo producción.

### Añadido

#### Ola 1: núcleo (2026-10-24)

- **Identidad y roles:** inicio de sesión con token de acceso y de renovación (rotación en cada uso), roles Administrador, Supervisor y Ejecutivo, y gestión de usuarios (crear, editar, restablecer contraseña, desactivar; los usuarios no se borran).
- **Empresas:** listado paginado con búsqueda por RUC, razón social o nombre comercial (ignora tildes), filtros por sector, actividad y empleados, ficha, alta y edición, y sucursales.
- **Catálogos:** sectores (9) y actividades económicas (893 en los datos reales).
- **Importación del Excel:** lectura en streaming de `.xlsx` (máx. 50 MB) con progreso y reporte de filas rechazadas. Es idempotente: reimportar no duplica empresas ni cambia el estado de las gestionadas. Los RUC repetidos se guardan como sucursales.
- **Pipeline comercial:** máquina de estados con 8 estados y transiciones validadas en el dominio, reglas automáticas según el resultado de cada contacto, historial de cambios, registro de interacciones (llamada, WhatsApp, correo, visita u otro canal) y control de concurrencia por versión.
- **Frontend base:** aplicación React con inicio de sesión, navegación por rol, cliente de API y sistema de componentes.

#### Ola 2: rotación y gestión (2026-10-25)

- **Cartera rotativa:** ciclos de 3 semanas, carteras de 60 empresas (3 semanas × 20 contactos), plan semanal de al menos 20 contactos con prioridad por motivo (seguimiento, nueva, reintento, rotación) y cobertura de todo el ciclo.
- **Rotación automática:** job semanal los lunes a las 06:00 (hora de Managua) que cierra ciclos, libera las empresas con 2 ciclos sin avance, reparte el pool y genera los planes. Es idempotente y se puede lanzar a mano desde la interfaz.
- **Reparto manual:** reasignar empresas entre ejecutivos, liberar asignaciones con motivo y asignación masiva desde el pool por sector, actividad y número de empleados.
- **Citas:** agendar (presencial o virtual), reprogramar, marcar como realizada o cancelar. La empresa pasa a *Agendando cita* y solo se puede agendar si tiene respuesta previa.
- **Contratos de venta:** borrador editable, envío, firma, activación y cancelación, con código `CT-AAAA-NNNNNN`, importes con dos decimales y monedas NIO y USD. El estado *Vencido* lo calcula el sistema. La activación mueve la empresa a *Contrato activo* y la saca de la rotación.
- **Analítica:** indicadores de resumen, embudo, actividad semanal, desempeño por ejecutivo y cobertura del ciclo, calculados solo en lectura.
- **Frontend de empresas, importación y usuarios:** tabla de empresas con filtros, alta y edición, ficha con línea de tiempo, pantalla de importación y de usuarios.
- **Kanban del pipeline:** tarjetas arrastrables entre columnas, menú *Mover a…* y panel *Registrar contacto*.

#### Ola 3: experiencia y calidad (2026-10-25)

- **Mi semana:** plan del ejecutivo con progreso frente a la cuota, pestañas (pendientes, contactadas, todas), búsqueda y registro de contacto desde la propia lista. Los supervisores la ven para cualquier ejecutivo.
- **Cartera:** ciclo actual, cobertura y plan semanal por ejecutivo, y tabla de empresas asignadas con reasignación, liberación y asignación masiva.
- **Tablero:** embudo, cumplimiento de cuota, cobertura del ciclo, conversión y contratos activos, con gráficos y filtros por periodo, ejecutivo y sector. Cada ejecutivo ve solo sus cifras.
- **Citas y contratos en la interfaz:** agenda semanal y lista, con diálogos de agendado, reprogramación y cierre; y listado de contratos con filtros y detalle con acciones de estado.
- **Documentación:** Swagger UI en desarrollo, referencia de la API por módulo, guía de despliegue, manual de usuario por rol y ADR de cada decisión de arquitectura.
- **Pruebas:** integración contra SQL Server real (auth, empresas, pipeline, cartera, citas, contratos, importación y analítica) y pruebas E2E con Playwright de los flujos clave.

#### Ola 4: cierre (2026-10-25)

- **Entorno QA tipo producción** con la importación completa de las 127 197 filas reales, la rotación ejecutada y 8 semanas de actividad simulada.
- **Prueba de carga** reproducible (`backend/scripts/load-test.ts`) y guía de despliegue actualizada con la configuración de producción recomendada.
- **`SCHEDULER_ENABLED`:** con varias instancias de la API, solo la que lo tenga en `true` ejecuta la rotación semanal y la purga diaria de tokens.
- **Versión visible:** `/api/health` y Swagger devuelven la versión, y la barra lateral muestra `v1.0.0`.
- **Lista de comprobación del release** (`docs/release-1.0.0.md`): variables de entorno, pasos de base de datos, pruebas tras desplegar y vuelta atrás.

### Cambiado

- **Permisos de edición de empresas:** un ejecutivo solo puede editar una empresa o añadirle sucursales si está en su cartera activa. Fuera de ella recibe `403 PORTFOLIO_COMPANY_NOT_ASSIGNED`. Administradores y supervisores no cambian.
- **Empresas sin teléfono:** no se asignan automáticamente a las carteras. Sí pueden asignarse a mano.
- **Ordenación de listados:** al ordenar en sentido descendente, las empresas con el mismo valor se desempatan por identificador en la misma dirección. El orden entre empresas con igual valor puede cambiar; sigue siendo estable.
- **Carga del frontend:** cada pantalla se carga bajo demanda y las dependencias se separan en fragmentos propios. La carga inicial baja de 967 kB a 707 kB (224 kB comprimidos).
- **Cancelar una cita o un contrato** no devuelve la empresa a un estado anterior: el siguiente paso lo decide el usuario en el pipeline.

### Corregido

- **Eventos después de confirmar:** los eventos de dominio se publican solo cuando la transacción se confirma; con error se descartan.
- **Cobertura del ciclo:** cuenta cualquier interacción dentro del ciclo, con la misma regla que la cartera.
- **Importación:** un Excel con solo cabecera falla con un mensaje claro en lugar de terminar en silencio; las anotaciones automáticas del historial usan etiquetas en español.
- **Sesión al recargar:** recargar la página mientras se restaura la sesión ya no cierra la sesión. Un token de renovación recién rotado se tolera durante 30 segundos (ADR 0007).
- **Errores de API:** un JSON mal formado o un cuerpo mayor de 100 KB responde 400 o 413 (antes 500). Los errores de duplicado y de registro inexistente se traducen a 409 y 404.
- **Móvil:** se corrigieron el desbordamiento horizontal y el doble scroll de la página.
- **Mi semana:** el resumen de la rotación lanzada desde la pantalla sigue visible aunque el estado vacío desaparezca al refrescarse.
- **Servicios en segundo plano:** los errores de suscriptores y del job semanal se registran sin mensajes de Prisma.
- **Errores de importación:** el mensaje guardado en el job ya no incluye el texto crudo del driver (podía contener datos personales); se guarda un mensaje seguro con código.

### Seguridad

Revisión de seguridad y arquitectura de la Ola 3 (ver `docs/security-review.md`). Hallazgos corregidos:

- **Sesiones:** un token de acceso activo ya no sobrevive a la desactivación, al cambio de rol ni al restablecimiento de contraseña. Las comprobaciones de estado y rol se hacen en cada petición, con una caché de 30 segundos.
- **Fuerza bruta:** además del límite por IP, el inicio de sesión limita a 10 intentos cada 15 minutos por cuenta. La IP real se toma del proxy solo si se configura `TRUST_PROXY`.
- **Control de acceso (IDOR):** un ejecutivo no puede modificar empresas de otras carteras.
- **Subida de archivos:** se valida la firma ZIP y el directorio central del `.xlsx` sin descomprimirlo, con límites de tamaño y de proporción de compresión contra bombas ZIP. Las importaciones se serializan y se limita el número de filas.
- **Datos personales en logs:** los errores de 500 no registran los argumentos de las consultas (cédulas, teléfonos, nombres).
- **Redirecciones:** la redirección tras el inicio de sesión rechaza barras invertidas y caracteres de control.
- **Configuración:** `CORS_ORIGIN=*` se rechaza al arrancar.
- **Dependencias:** `multer` 2.5 y `happy-dom` 21; el resto de avisos de `bun audit` se evaluó y se aceptó con justificación.
- **Base de datos:** validado en QA: la aplicación funciona con un login de mínimos privilegios (`db_datareader`, `db_datawriter` y `EXECUTE`); las migraciones usan otro login con `db_ddladmin`.
- **Secretos:** `.gitignore`, secretlint y gitleaks en CI, sin valores por defecto para secretos y sin ningún `.env`, `.xlsx` ni `data/` en el historial.

Pendiente, documentado en la revisión de seguridad:

- Ejecutar siempre con `NODE_ENV=production` detrás de HTTPS (la cookie de renovación y la desactivación de Swagger dependen de ello).
- Con varias instancias de la API, la invalidación de sesiones y el límite de login son por proceso. Hoy hay una sola instancia y el cron debe correr en una única réplica.
- Sin límite global de peticiones en endpoints costosos (se recomienda en el proxy).

Cerrado en la Ola 4: purga diaria de tokens de renovación caducados o revocados hace más de 30 días.

### Rendimiento

Medido en el entorno QA con los 127 197 registros reales (`docs/rendimiento-qa.md`).

- **Búsqueda de empresas:** de 1,3 s a unos 140 ms, con una columna calculada normalizada e índices cubrientes.
- **Tablero del pipeline:** de 171 ms a 39 ms sin texto, y 77 ms con búsqueda.
- **Listados con 10 usuarios simultáneos (bucle cerrado):** listado de empresas p95 de 410 a 80 ms; página profunda de 3 832 a 232 ms; peor lectura p95 de 3 832 a 381 ms. El resumen por sector pasa de 710 a 134 ms.
- **Capacidad:** de unas 50 a unas 150 peticiones por segundo con un solo proceso de API, sin errores 5xx ni interbloqueos. Con 30 usuarios a ritmo humano (una petición por segundo) todas las lecturas quedan por debajo de 200 ms de p95.
- **Importación:** primera carga de 127 197 filas en unos 170 s (103 657 empresas y 20 490 sucursales); una segunda ejecución sobre los mismos datos tarda unos 22 s y no cambia nada.
- **Catálogos:** sectores y actividades en caché de memoria, sin consultas repetidas por página.

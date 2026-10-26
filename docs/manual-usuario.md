# Manual de usuario de AXIOM CRM

Guía corta por rol. Explica lo que la aplicación hace sola (cambios de estado, reparto de carteras, planes semanales) para que sepas por qué una empresa cambia o por qué aparece en tu semana.

Las pantallas disponibles son **Mi semana**, **Pipeline**, **Empresas**, **Cartera**, **Citas**, **Contratos** y **Tablero** para todos los roles. **Importación** y **Usuarios** son solo para el administrador.

## 1. Conceptos básicos

### Empresas

Cada empresa se identifica por su **RUC**. Vienen del Excel importado o se dan de alta a mano. Una empresa puede tener **sucursales** (nóminas o direcciones adicionales); una sucursal no es una empresa nueva.

Una empresa **sin teléfono** no se reparte sola en las carteras. Puede gestionarse a mano, pero el sistema no la asigna automáticamente.

### Estados del pipeline

| Estado | Significado |
|---|---|
| Por contactar | Empresa nueva, sin gestión |
| Contactado | Se ha intentado contactarla |
| Sin respuesta | Se intentó y no contestó (se puede reintentar) |
| Con respuesta | Contestó o mostró interés |
| Agendando cita | Se está coordinando o ya hay una cita |
| En proceso de contrato | Hay un contrato en curso |
| Contrato activo | Cliente ganado; sale de la rotación de prospección |
| Descartado | No interesada o datos no válidos; sale de la rotación |

### Cartera y ciclos

- Cada ejecutivo trabaja una **cartera** de unas **60 empresas**.
- El trabajo se organiza en **ciclos de 3 semanas** (de lunes a domingo, hora de Managua). La pantalla **Cartera** muestra en qué semana del ciclo estamos.
- Cada semana el ejecutivo debe contactar **al menos 20 empresas**. El sistema prepara ese plan cada lunes.
- Dentro del ciclo, el objetivo es que **todas** las empresas de la cartera se contacten al menos una vez.
- Si una empresa acumula **2 ciclos seguidos sin avance**, vuelve al pool y se reasigna. Hay **avance** cuando la empresa llega a *Con respuesta* o a una etapa posterior dentro del ciclo.

## 2. Reglas automáticas del pipeline

Se aplican al registrar un contacto (ver sección 4) según su resultado:

1. **Primer intento:** si la empresa está en *Por contactar* o *Sin respuesta*, pasa a *Contactado*.
2. **Según el resultado**, desde *Contactado*:
   - *No contestó* o *Número equivocado* → pasa a *Sin respuesta*.
   - *Contestó*, *Interesado* o *Volver a llamar* → pasa a *Con respuesta*.
   - *No interesado* → no cambia. Descartarla es una decisión tuya, con motivo.
3. A partir de *Con respuesta*, los cambios son **manuales**: los haces en el tablero kanban o en la ficha de la empresa, y el sistema comprueba que el paso esté permitido.

Cada cambio queda en el **historial** de la empresa, con quién lo hizo y cuándo.

- **Pasos no permitidos.** Un cambio que salte etapas (por ejemplo, de *Por contactar* a *Contrato activo*) se rechaza y la aplicación indica los estados permitidos.
- **Descartar.** Cualquier estado abierto puede pasar a *Descartado*, pero **siempre con un motivo**. Reactivar una empresa descartada solo lo pueden hacer administradores y supervisores.
- **Cambios simultáneos.** Si otra persona modificó la empresa mientras la tenías abierta, la aplicación recarga los datos y te pide revisar antes de intentarlo de nuevo. No se pierde lo que ella registró.

## 3. Citas y contratos

**Citas**

- Solo se puede agendar una cita con una empresa que esté en *Con respuesta* o en una etapa posterior. En otro caso la aplicación muestra: *"La empresa debe estar en 'Con respuesta' para agendar una cita…"*.
- Al agendar, la empresa pasa a *Agendando cita*.
- Una cita puede quedar **realizada** (hay que indicar su resultado), **cancelada** o **reprogramada**. Reprogramar crea una cita nueva y deja la original como histórico.
- Cancelar una cita **no** devuelve la empresa a un estado anterior: decides tú el siguiente paso.
- La fecha de la cita debe ser futura. En citas presenciales el lugar es obligatorio.
- Un ejecutivo solo gestiona sus propias citas. Supervisores y administradores ven y gestionan las de todo el equipo.

**Contratos**

- Un contrato se crea en **Borrador**. Al crearlo, la empresa pasa a *En proceso de contrato*; para crearlo, la empresa debe estar en *Agendando cita* o en una etapa posterior (si no, la aplicación lo indica).
- Solo se puede editar (importe, fechas, moneda, notas) mientras está en **Borrador**.
- Acciones del contrato, en orden:
  1. **Marcar como enviado** → *Enviado*.
  2. **Marcar como firmado** → *Firmado*. No cambia la empresa.
  3. **Activar contrato** → *Activo*. La empresa pasa a *Contrato activo* y sale de la rotación.
  - **Cancelar contrato** es posible en cualquier estado no final. Es definitivo y no mueve la empresa en el pipeline.
- Un contrato **Vencido** es uno Activo cuya fecha de fin ya pasó. Lo marca el sistema; no se puede elegir a mano, y un contrato vencido no se puede activar.
- Los importes se muestran con dos decimales. Monedas: córdobas (NIO) y dólares (USD).
- Un ejecutivo solo ve y gestiona los contratos que él creó.

## 4. Ejecutivo

### Mi semana

Es la pantalla principal.

- Lista las empresas del plan de la semana, con el motivo de cada una: **Seguimiento** (tienes un seguimiento o cita comprometida), **Nueva** (nunca gestionada), **Reintento** (no respondió antes) o **Rotación** (toca retomar el contacto para cubrir el ciclo).
- Muestra tu avance, por ejemplo **12 / 20 contactadas**, y avisa cuando llegas a la cuota.
- Pestañas **Pendientes**, **Contactadas** y **Todas**, y un buscador por nombre o teléfono.
- Desde cada empresa registras el contacto sin salir de la pantalla.
- Si aún no hay plan, la pantalla lo explica: el plan se genera cada lunes a las 06:00.

### Registrar un contacto

Desde **Mi semana**, desde la ficha de la empresa o desde el kanban:

1. Elige el **canal**: llamada, WhatsApp, correo, visita u otro.
2. Elige el **resultado**: contestó, no contestó, número equivocado, interesado, no interesado o volver a llamar.
3. Escribe **notas** si hace falta (máximo 2000 caracteres).
4. Si tienes una fecha para volver a llamar, indícala en *Próximo seguimiento*: aparecerá como seguimiento en tu semana. No puede ser anterior al contacto ni futura respecto al propio contacto.
5. Opcionalmente, en *Mover a*, elige un estado. Si lo dejas en *Solo cambios automáticos*, se aplican solo las reglas de la sección 2.
6. Guarda.

### Pipeline (kanban)

- Columnas por estado, con el número de empresas en cada una. Puedes contraer columnas y cargar más tarjetas.
- **Arrastra** una tarjeta a otra columna para cambiar su estado, o usa el botón **Mover a…** de la tarjeta. Si el paso no está permitido, la aplicación lo indica y la tarjeta vuelve a su sitio.
- Filtra por sector o actividad, o busca por RUC, razón social o nombre comercial.

### Ficha de empresa

Muestra los datos de la empresa, sus sucursales, la línea de tiempo (interacciones e historial de estados) y sus citas y contratos. Desde aquí puedes:

- **Registrar contacto** y **Cambiar estado**.
- **Editar empresa**, **Agregar sucursal**, **Agendar cita** y **Crear contrato**.

La cédula del representante legal solo la ven administradores y supervisores.

### Empresas (listado)

Busca por RUC, razón social o nombre comercial (no importan las tildes). Filtra por estado, sector, actividad, número de empleados y **Con teléfono**.

### Cartera (propia)

Muestra tu ciclo actual (semana *k* de 3), tu cobertura del ciclo, tu plan de la semana y las empresas asignadas a ti. No reasignas ni liberas empresas: eso lo hace el supervisor.

### Tablero (propio)

Muestra tus indicadores: contactos frente a cuota, cobertura del ciclo, avances, citas y contratos. Los periodos disponibles son *Esta semana*, *Últimas 4 semanas* (por defecto), *Últimas 12 semanas* y *Personalizado*.

## 5. Supervisor

Todo lo de ejecutivo, sobre cualquier empresa. Además:

### Cartera

- Ve las carteras de todos los ejecutivos, con su **cobertura del ciclo** y el **plan de la semana** de cada uno. Desde ahí puedes abrir la semana de un ejecutivo.
- Filtra las empresas asignadas por ejecutivo.
- **Reasignar:** selecciona empresas con la casilla y pulsa *Reasignar a…*. Las empresas dejan la cartera anterior.
- **Liberar:** saca una empresa de la cartera y la devuelve al pool, indicando el motivo (sin avance, reasignación manual, contrato activo o descartada).
- **Asignación masiva:** toma empresas **del pool** que cumplan los filtros (sector, actividad, número mínimo de empleados) y las asigna **al ejecutivo que elijas**, empezando por las de más empleados. Puedes limitar la cantidad. Solo entran empresas con teléfono.

### Mi semana y Tablero

- En **Mi semana** eliges el ejecutivo en el selector para ver su plan.
- En el **Tablero** puedes filtrar por ejecutivo y por sector, y ver el desempeño de todo el equipo.

### Otros permisos

- Reactivar empresas descartadas.
- Ver y gestionar citas y contratos de todo el equipo.
- No puedes crear ni desactivar usuarios, ni importar el Excel, ni ejecutar la rotación: eso es del administrador.

## 6. Administrador

### Usuarios

- **Crear** un usuario con nombre, correo, contraseña inicial (mínimo 8 caracteres) y rol: *Administrador*, *Supervisor* o *Ejecutivo*.
- **Editar** nombre, rol y el casillero **Activo**. Desmarcar *Activo* desactiva al usuario: no puede entrar, pero sus datos e historial se conservan. Los usuarios no se borran.
- **Restablecer contraseña** de un usuario. Entrégala en persona; no la compartas por chat ni correo.
- La aplicación no te deja desactivarte a ti mismo ni dejar el sistema sin ningún administrador activo.

### Importación del Excel

1. En **Importación**, elige el archivo `.xlsx` (máximo 50 MB).
2. El proceso corre en segundo plano. El estado pasa de *En cola* a *Procesando* y termina en *Completado* o *Fallido*.
3. Al terminar revisa el resumen: filas leídas, insertadas, actualizadas, sucursales y rechazadas.
4. Si hay filas rechazadas, la lista muestra su número de fila y el motivo (por ejemplo, *RUC faltante*). Los datos personales de esas filas no se muestran.

Importar de nuevo el mismo archivo es seguro: no duplica empresas y no cambia el estado comercial de las que ya tienen gestión. En la sesión puedes ver las importaciones lanzadas.

### Ejecutar la rotación

La rotación se ejecuta sola cada lunes a las 06:00 (hora de Managua). Puedes lanzarla a mano desde **Cartera** o **Mi semana** si hace falta, por ejemplo tras una interrupción del servicio. Repetirla en la misma semana no cambia nada.

La rotación:

1. Cierra el ciclo anterior si ya terminó y evalúa qué empresas no tuvieron avance.
2. Libera las que llevan 2 ciclos sin avance.
3. Abre el ciclo actual si no está abierto.
4. Completa las carteras de los ejecutivos desde el pool.
5. Genera los planes semanales de al menos 20 contactos.

Si no hay ciclo activo, las pantallas lo indican y ofrecen ejecutar la rotación.

### Seguridad de la cuenta

- Cierra sesión en equipos compartidos.
- Si desactivas a alguien o le cambias el rol, su sesión deja de ser válida en menos de 30 segundos.

## 7. Preguntas frecuentes

**¿Por qué una empresa cambió de estado sola?** Registraste un contacto con un resultado que activa una regla de la sección 2. Mira su historial en la ficha.

**¿Por qué no puedo agendar una cita o crear un contrato?** La empresa todavía no está en la etapa necesaria. La pantalla indica en cuál debe estar. Si la conversación lo justifica, registra primero un contacto con respuesta o mueve la empresa en el pipeline.

**¿Por qué una empresa desapareció de mi cartera?** Puede haber sido reasignada por un supervisor, liberada tras dos ciclos sin avance, o haber pasado a *Contrato activo* o *Descartado*.

**¿Por qué no puedo editar una empresa ni agregarle una sucursal?** Como ejecutivo solo puedes operar empresas de tu cartera activa. Si la empresa no está asignada a ti, la aplicación muestra: *"Esta empresa no está asignada a tu cartera."* Lo mismo ocurre al registrar un contacto o cambiar su estado.

**¿Por qué no veo plan esta semana?** El plan se genera cada lunes a las 06:00. Si ya pasó la hora y no existe, pide a un administrador que ejecute la rotación semanal; no duplica nada.

**¿Por qué no aparece una empresa en el reparto automático?** Si no tiene teléfono, el sistema no la asigna sola. Un supervisor puede asignarla a mano.

**¿Por qué aparece "Otra persona actualizó esta empresa"?** Alguien cambió la empresa al mismo tiempo. La aplicación recargó los datos; revisa el estado actual y vuelve a intentarlo.

**¿Por qué no puedo descartar una empresa?** Descartar exige un motivo. Escríbelo en el campo de nota y vuelve a intentarlo.

**¿Por qué no puedo reactivar una empresa descartada?** Solo administradores y supervisores pueden devolverla a *Por contactar*.

**¿Qué pasa si recargo la página mientras inicio sesión o se restaura mi sesión?** La sesión se restaura sola con la cookie de renovación; no tienes que volver a entrar. Si la recarga coincide con otra restauración (por ejemplo, con varias pestañas abiertas), la aplicación lo tolera. Si la sesión ya no es válida (cierre de sesión, cuenta desactivada, contraseña cambiada), vuelves a *Iniciar sesión* y, tras entrar, regresas a la página que querías abrir.

**¿Cuántos intentos de inicio de sesión tengo?** Si te equivocas varias veces seguidas, la aplicación pide esperar un rato. Muestra *"Demasiados intentos. Inténtalo más tarde."*

**¿Puedo usar AXIOM CRM desde el móvil?** Sí. Las pantallas se adaptan al ancho de la pantalla y, donde hay listas largas (por ejemplo, Cartera), se muestran como tarjetas.

**¿Reimportar el Excel cambia el estado de las empresas?** No. Las empresas ya gestionadas conservan su estado, su historial y su último contacto.

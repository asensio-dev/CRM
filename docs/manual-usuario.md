# Manual de usuario de AXIOM CRM

Guía corta por rol. Explica las reglas del negocio que la aplicación aplica sola, para que sepas por qué una empresa cambia de estado o por qué aparece en tu semana.

> **Estado de las pantallas.** Hoy están terminadas el inicio de sesión, Empresas (listado y ficha), Pipeline (tablero kanban), Importación y Usuarios. Las pantallas **Mi semana**, **Cartera**, **Tablero**, **Citas** y **Contratos** se están construyendo; aquí se describen según el plan y la API disponible, y pueden cambiar de aspecto al publicarse.

## 1. Conceptos básicos

### Empresas

Cada empresa se identifica por su **RUC**. Las empresas vienen del Excel importado y pueden añadirse a mano. Una empresa puede tener **sucursales** (nóminas o direcciones adicionales); las sucursales no son empresas nuevas.

Una empresa **sin teléfono** no se asigna automáticamente a una cartera: puede gestionarse a mano, pero el sistema no la reparte sola.

### Pipeline (estados comerciales)

Cada empresa está en uno de estos estados:

| Estado | Significado |
|---|---|
| Por contactar | Empresa nueva, aún sin gestión |
| Contactado | Se ha intentado contactarla |
| Sin respuesta | Se intentó y no contestó (se puede reintentar) |
| Con respuesta | Contestó y hay conversación o interés |
| Agendando cita | Se está coordinando o ya hay una cita |
| En proceso de contrato | Propuesta, negociación o firma en curso |
| Contrato activo | Cliente ganado; sale de la rotación de prospección |
| Descartado | No interesada o datos no válidos; sale de la rotación |

### Cartera y ciclos

- Cada ejecutivo trabaja una **cartera** de unas **60 empresas**.
- El trabajo se organiza en **ciclos de 3 semanas** (de lunes a domingo, hora de Managua).
- Cada semana el ejecutivo debe contactar **al menos 20 empresas** de su cartera. El sistema prepara ese plan cada lunes.
- Dentro de un ciclo, el objetivo es que **todas** las empresas de la cartera se contacten al menos una vez.
- Si una empresa lleva **2 ciclos seguidos sin avance**, vuelve al pool y se reasigna a otro ejecutivo. Hay **avance** cuando la empresa llega a *Con respuesta* o a una etapa posterior dentro del ciclo.

## 2. Reglas automáticas del pipeline

Estas reglas las aplica el sistema cuando registras una interacción (llamada, WhatsApp, correo, visita u otro canal) con su resultado:

1. **Primer intento:** si la empresa está en *Por contactar* o *Sin respuesta*, pasa a *Contactado*.
2. **Según el resultado**, desde *Contactado*:
   - *No contestó* o *Número equivocado* → pasa a *Sin respuesta*.
   - *Contestó*, *Interesado* o *Volver a llamar* → pasa a *Con respuesta*.
   - *No interesado* → no cambia. Descartarla es una decisión tuya, con motivo.
3. A partir de *Con respuesta*, los cambios de estado son **manuales**: los haces tú en el tablero o en la ficha de la empresa, y el sistema comprueba que el paso esté permitido.

Cada cambio queda en el **historial** de la empresa, con quién lo hizo y cuándo.

**Pasos no permitidos.** Un cambio que salte etapas (por ejemplo, de *Por contactar* a *Contrato activo*) se rechaza. Las transiciones válidas aparecen en la ficha de la empresa.

**Descartar.** Cualquier estado abierto puede pasar a *Descartado*, pero **siempre con una nota** que explique el motivo. Reactivar una empresa descartada (volver a *Por contactar*) solo lo pueden hacer administradores y supervisores.

**Concurrencia.** Si dos personas modifican la misma empresa a la vez, el sistema avisa de que el dato cambió y te pide recargar antes de guardar. No pierdes lo que otra persona ya registró.

## 3. Citas y contratos

**Citas.**

- Solo puedes agendar una cita con una empresa que ya tenga respuesta (*Con respuesta* o posterior). Si la empresa está en *Por contactar*, *Contactado*, *Sin respuesta* o *Descartado*, el sistema no permite agendar.
- Al agendar, la empresa pasa a *Agendando cita*.
- Una cita puede quedar **realizada** (con su resultado), **cancelada** o **reprogramada**. Reprogramar crea una cita nueva y deja la original como histórico.
- Cancelar una cita **no** devuelve la empresa a un estado anterior: decides tú el siguiente paso en el tablero.
- La fecha de la cita debe ser futura y, si es presencial, debe indicarse el lugar.

**Contratos.**

- Un contrato se crea en **Borrador** y solo puede editarse en ese estado (importe, fechas, moneda, notas).
- Al enviarlo, la empresa pasa a *En proceso de contrato*.
- Cuando el contrato queda **Activo**, la empresa pasa a *Contrato activo* y sale de la rotación.
- Un contrato **Vencido** es uno Activo cuya fecha de fin ya pasó. Lo marca el sistema; no se puede elegir a mano.
- Los importes se muestran siempre con dos decimales. Las monedas son córdobas (NIO) y dólares (USD).
- Un ejecutivo solo ve los contratos que él creó.

## 4. Ejecutivo

### Mi semana (en construcción)

Es la pantalla principal:

- Lista las empresas de tu plan de la semana (al menos 20), con el motivo de cada una: *Seguimiento* (tienes una fecha comprometida), *Nueva* (nunca gestionada), *Reintento* (sin respuesta antes) o *Rotación* (lleva tiempo sin contacto).
- Muestra tu progreso, por ejemplo **12 / 20** contactadas.
- Desde cada empresa puedes registrar el contacto sin salir de la pantalla.

### Registrar un contacto

En la ficha de la empresa o desde Mi semana:

1. Elige el **canal** (llamada, WhatsApp, correo, visita u otro).
2. Elige el **resultado** (contestó, no contestó, número equivocado, interesado, no interesado, volver a llamar).
3. Escribe **notas** si hace falta (hasta 2000 caracteres).
4. Si tienes una fecha para volver a llamar, indícala: aparecerá como seguimiento en tu semana.
5. Guarda. El sistema aplica las reglas automáticas de la sección 2.

No puedes registrar una interacción con fecha futura. La fecha de seguimiento no puede ser anterior al contacto.

### Pipeline (kanban)

- Columnas por estado, con el número de empresas en cada una.
- Arrastra una tarjeta a otra columna para cambiar su estado. Si el paso no está permitido, la tarjeta vuelve a su sitio y el sistema indica por qué.
- Filtra por sector o actividad, o busca por RUC o nombre.

### Ficha de empresa

Muestra los datos de la empresa, sus sucursales, la línea de tiempo (interacciones e historial de estados) y, cuando existan, sus citas y su contrato. Puedes editar datos de contacto y añadir sucursales.

La cédula del representante legal solo la ven administradores y supervisores.

### Empresas (listado)

Busca por RUC, razón social o nombre comercial (no importan las tildes). Filtra por estado, sector, actividad, número de empleados y si tiene teléfono.

## 5. Supervisor

### Cartera (en construcción)

- Ve las carteras de todos los ejecutivos y el **ciclo actual**: semana *k de 3*, empresas pendientes de tocar en el ciclo y cobertura por ejecutivo.
- **Reasignar** empresas de un ejecutivo a otro. Las empresas reasignadas dejan de aparecer en la cartera anterior.
- **Liberar** una asignación (la empresa vuelve al pool) indicando el motivo.
- **Asignación masiva** desde el pool, filtrando por sector, actividad o número de empleados. Se reparten entre ejecutivos activos.

### Tablero (en construcción)

- **Embudo** por estado, con cuántas empresas hay en cada uno y cuántas llegaron en el periodo.
- **Cumplimiento de cuota** semanal por ejecutivo (contactos realizados frente a 20).
- **Cobertura del ciclo**: qué parte de cada cartera se ha contactado.
- **Conversión** entre etapas y contratos activos.

### Lo que puedes hacer como supervisor

- Todo lo de ejecutivo, sobre cualquier empresa.
- Ver y gestionar citas y contratos de todo el equipo.
- Reactivar empresas descartadas.
- No puedes crear ni desactivar usuarios (eso es del administrador).

## 6. Administrador

### Usuarios

- **Crear** un usuario con email, nombre, contraseña inicial (mínimo 8 caracteres) y rol: *Administrador*, *Supervisor* o *Ejecutivo*.
- **Cambiar** el nombre o el rol de un usuario.
- **Desactivar** un usuario: deja de poder entrar, pero sus datos y su historial se conservan. Los usuarios no se borran.
- **Restablecer la contraseña** de un usuario.
- El sistema no te permite desactivarte a ti mismo ni dejar la aplicación sin ningún administrador activo.

### Importación del Excel

1. Sube el archivo `.xlsx` (máximo 50 MB).
2. El proceso corre en segundo plano; la pantalla muestra el avance hasta *Completado* o *Fallido*.
3. Al terminar, revisa el resumen: filas leídas, empresas nuevas, actualizadas, sucursales y rechazadas.
4. Si hay filas rechazadas, la lista muestra el número de fila y el motivo (por ejemplo, RUC vacío). Los datos personales de esas filas no se muestran.

Importar de nuevo el mismo archivo es seguro: no duplica empresas y no cambia el estado comercial de las que ya tienen gestión.

### Ejecutar la rotación

La rotación semanal se ejecuta sola cada lunes a las 06:00. Como administrador puedes lanzarla a mano si hace falta (por ejemplo, tras una interrupción del servicio). Hacerlo dos veces en la misma semana no cambia nada.

Al ejecutarla, el sistema:

1. Cierra el ciclo anterior si ya terminó, y calcula qué empresas no tuvieron avance.
2. Libera las que llevan 2 ciclos sin avance.
3. Abre el ciclo actual si no está abierto.
4. Completa las carteras de los ejecutivos desde el pool.
5. Genera los planes semanales de 20 o más contactos.

### Contraseñas y seguridad

- No compartas contraseñas por chat ni correo. Si alguien necesita una nueva, restablécela y entrégala en persona.
- Cierra sesión en equipos compartidos.

## 7. Preguntas frecuentes

**¿Por qué una empresa cambió de estado sola?** Porque registraste una interacción con un resultado que activa una regla de la sección 2. Mira su historial.

**¿Por qué no puedo agendar una cita?** La empresa todavía no tiene respuesta. Regístrala primero como *Con respuesta* (si el contacto lo justifica).

**¿Por qué una empresa desapareció de mi cartera?** Puede haber sido reasignada por un supervisor, liberada tras dos ciclos sin avance, o pasar a *Contrato activo* o *Descartado*.

**¿Por qué no aparece una empresa en el reparto automático?** Si no tiene teléfono, el sistema no la asigna sola.

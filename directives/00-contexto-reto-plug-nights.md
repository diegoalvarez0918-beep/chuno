# CONTEXTO DEL RETO — Plug Nights (hackathon 48h)

> Documento de contexto extraído de la sesión de Q&A con el equipo de Plug.
> **La sección 10 (MI SOLUCIÓN) se llena al cerrar el brainstorming.**

---

## 1. Qué es el concurso

Hackathon de **Plug (Pluggi)** con ventana de construcción de **48 horas**. Dos carriles:

- **Carril A:** Marketing
- **Carril B:** Optimización de procesos para negocios

Se compite en uno solo. El ganador de cada vertical entra como "franquiciado cero" de Plug: Plug se convierte en el agente comercial que sale a vender la solución.

---

## 2. Entregables y fechas

| Qué | Cuándo |
|---|---|
| Subir 2 links a la página pública del concurso: (1) repo del código *si aplica*, (2) link a la herramienta/demo funcional | Jueves 30 de julio |
| Votación pública abierta (cualquier persona puede votar) | Cierra viernes 31 de julio, 6:30 p.m. hora Colombia |
| Evento Plug Nights + pitches | Viernes 31 de julio, 6:30 p.m. (llegar 6:00 p.m.). Híbrido: presencial y virtual |

**Nota:** en la transcripción se menciona "jueves" para los links y "viernes"/31 de julio para el evento. La votación cierra exactamente cuando arranca el evento. Confirmar en el grupo si hay ambigüedad.

**Filtro:** solo los **3 más votados de cada carril** pasan a pitchear. La votación popular es un filtro tan real como la calidad técnica.

---

## 3. Formato del pitch

- Tipo **investor pitch**, **10 minutos incluyendo preguntas del jurado**.
- Jurado externo ("my tops"), anunciado días antes.
- Se puede presentar presencial o virtual.

---

## 4. Criterios de evaluación (dichos textualmente por Plug)

1. **Qué tan implementable es la solución** — que se pueda desplegar en un negocio real.
2. **Seguridad** — que la arquitectura no sea un colador.
3. **Escalabilidad** — que aguante crecimiento.
4. **Calidad de la presentación** — storytelling y claridad.
5. **Que el MVP funcione** — un producto funcional en vivo pesa más que un producto completo pero muerto.

Frase clave del organizador: *"mientras tengan un producto funcional y sepan expresar muy bien la visión y esté funcionando en este momento como MVP, así sea como MVP, tiene mayor probabilidad de ganar."*

---

## 5. Qué NO exigen

- **No** exigen producto terminado ni "ultra pulido".
- **No** exigen stack, framework ni herramienta específica.
- Lo que sí exigen: que el **problema esté clarísimo** y que la solución sea un acercamiento coherente a ese problema.

---

## 6. Directrices técnicas explícitas del equipo de Plug

- **Arquitectura tipo LEGO:** modular, piezas reemplazables. Si un módulo no funciona, se itera rápido sin tumbar el resto.
- **Seguridad y escalabilidad desde el diseño**, no como parche.
- **Mantenerlo "delgado" / lean.** Alcance mínimo bien ejecutado.
- **Enamorarse del problema, no de la idea ni de la solución.** La solución puede mutar; el problema es el ancla.
- La arquitectura debe permitir **migrar** para atacar problemas adyacentes.

---

## 7. Estructura recomendada del pitch (por el equipo de Plug)

1. **Hook** — enganchar a la audiencia de entrada.
2. **Historia / motivación** — por qué esto, por qué tú.
3. **Problema** — con nitidez.
4. **De quién es la necesidad** — el usuario específico, no "todas las empresas".
5. **La respuesta** — demo funcionando.
6. **Detalles técnicos** — solo aquí, no antes.
7. **Visión** — por qué esta solución gana frente a las demás.

Consejo del ganador del último Demo Day: *"sé atrevido"*, *"enfócate en demostrar lo que hiciste y que funcione"*. Coherencia: por qué introduces esto y para quién.

Plug va a hacer **sesiones cortas cada noche**, incluida una dedicada a storytelling.

---

## 8. Premio y modelo comercial (contexto, no afecta el código)

- Ganador por vertical: se lleva **suscripciones** + entra al pipeline comercial de Plug.
- **Plug no cobra comisión sobre el precio del creador.** Paquetiza la solución: el creador define su precio, Plug le suma su margen encima. El creador no incurre en costos de promoción.
- **Pricing modular es válido** (cotización por módulo/ítem). Plug da asesoría de pricing antes de la etapa comercial.
- Si no se alcanza en 48h, Plug acompaña después. El concurso no es el final del camino.

---

## 9. Implicaciones directas para la construcción

Traducción de lo anterior a decisiones de ingeniería:

- **Prioridad #1: URL pública funcional.** El link a la herramienta es entregable obligatorio y es lo que la gente vota. Desplegar temprano (Vercel/Railway/Render) e iterar sobre producción, no dejar el deploy para el final.
- **Repo público y limpio** con README que abra con el problema, no con instrucciones de instalación. Los votantes y el jurado leen el README.
- **Demo con datos sembrados.** Nadie debe registrarse ni configurar nada para ver el valor en 30 segundos. Modo demo / cuenta de prueba precargada.
- **Un solo caso de uso hecho bien**, no cinco a medias. Los otros módulos se muestran como arquitectura, no como código a medio hacer.
- **Modularidad visible:** separación clara de capas (UI / lógica de negocio / integraciones / datos) para poder decir "esto es un LEGO" y mostrarlo en un diagrama.
- **Seguridad demostrable:** variables de entorno, sin secretos en el repo, validación de inputs, autenticación básica, control de acceso. Es criterio de evaluación explícito — dejar evidencia visible.
- **Escalabilidad demostrable:** stateless donde se pueda, colas o jobs para lo pesado, decisiones de datos justificables en una frase.
- **Preparar el demo del pitch en vivo:** flujo guionizado de 2-3 minutos, con plan B grabado por si falla la red.

---

## 10. MI SOLUCIÓN — [PENDIENTE DE LLENAR]

Se llena al cerrar el brainstorming. Debe contener:

- **Carril:** Marketing / Optimización de procesos
- **Problema:** (una frase, específica, con dolor real)
- **Quién lo sufre:** (perfil concreto: rol, tamaño de empresa, sector)
- **Cómo lo resuelven hoy:** (el statu quo que vas a reemplazar)
- **Solución propuesta:** (qué hace el producto)
- **Feature ganador:** (la única cosa que tiene que estar funcionando el viernes)
- **Stack:**
- **Fuera de alcance para las 48h:**

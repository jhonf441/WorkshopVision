# WorkshopVision -- historial de versiones

## 2.7.2 -- 2026-10-29

- Phone layout fixes (44 px touch targets, no overflow), Workbench full-screen section picker, clamps hint, interrupted jobs off the table, Machine scale label

## 2.7.1 -- 2026-10-29

- State chips with an icon: the icon carries the color and there is no dot (family.css); chosen chip tinted

## 2.7.0 -- 2026-10-29

- Side bars: no gray line, a chosen item goes to the start of its section; Printing: start-up chip without the mode rows, tests notice only when the chip is not green, no-sensor fault reading; Vision: settings cards packed in columns, laser crosses only with Laser mode; Zones: visible mode dot

## 2.6.31 -- 2026-10-28

- Design family: final shared styles

## 2.6.30 -- 2026-10-28

- Design family: page bar with badge, title and one line; menu, cards, buttons and states are the shared wf-* classes; the image, its overlays and the dock keep their dark look

## 2.6.29 -- 2026-10-28

- Minimalist design: neutral header and cards, text tabs and menu without color, gray icons, dot and word states, quiet messages, no tints or shadows

## 2.6.28 -- 2026-10-28

- Use as cutting area saves through machine.workarea.save (the service is the only writer of cutarea.g)

## 2.6.27 -- 2026-10-28

- Risk dialogs get their colored side bar back; one type scale (Roboto in the panels, no half sizes)

## 2.6.26 -- 2026-10-28

- Risk dialogs get their colored side bar back; one type scale (Roboto in the panels, no half sizes)

## 2.6.25 -- 2026-10-27

- Plan warnings in words, risk dialogs in DWC style, mesh point selection, link to Machine modes

## 2.6.24 -- 2026-10-27

- Side bar no longer makes the page jump when a shorter section is chosen; start-up chip as in every page (header, same wording)

## 2.6.23 -- 2026-10-26

- Run-time guard: the 3.6 build refuses to start on a host with window.DWC and the 3.7 build outside DWC 3.7.x (visible warning); shipped as a strict per-line zip (dwcVersion 3.6 / 3.7)

## 2.6.22 -- 2026-10-26

- Universal zip: the DWC 3.6 side is now built with the official 3.6 pipeline, so its i18n catalogs are registered and the menu captions show names instead of raw plugins.* keys.

## 2.6.21 -- 2026-10-26

- Shared lifecycle cleanup, friendly transport errors and the API token under /opt/dsf/conf.

## 2.6.20 -- 2026-10-24

- Start-up assistant: active lines highlighted, single-step way back, dark select options; Lights time picker and defaults; Vision relay message; Printing FFF switch; Mesh handles above the points

## 2.6.19 -- 2026-10-24

- Start-up card reports its pending count to the service (machine setup list)

## 2.6.18 -- 2026-10-23

- One sign-in for every tab (token in localStorage)

## 2.6.17 -- 2026-10-23

- Compact live job strip in the bar; page header treats an expired session as sign in; numeric PIN field

## 2.6.16 -- 2026-10-23

- Common page header: health chip, session chip, quiet start-up icon when ready

## 2.6.15 -- 2026-10-22

- Side-bar pin only while the bar is open; Lights panel counts only the faults the service marks

## 2.6.14 -- 2026-10-22

- A login_required answer no longer forces the PIN dialog

## 2.6.13 -- 2026-10-22

- Pin on every side bar, thin scrollbars, one sign-in dialog

## 2.6.12 -- 2026-10-22

- Pin on every side bar, thin scrollbars everywhere

## 2.6.11 -- 2026-10-22

- Sign-in never opens by itself; keyboard only on touch

## 2.6.10 -- 2026-10-22

- Fix names, values and catalog markers the English rename left behind

## 2.6.9 -- 2026-10-22

- Camera images that cannot load say why

## 2.6.8 -- 2026-10-22

- Sessions made clear: not-signed-in chip, sign-in on visitor 403, refusal toast

## 2.6.7 -- 2026-10-22

- Sign-in dialog focus and kiosk keyboard helper; Jog blocked touches explained

## 2.6.6 -- 2026-10-22

- Kiosk keyboard helper call, sign-in dialog font

## 2.6.5 -- 2026-10-22

- Jog and bars tell why an action is blocked and ask for the session; Jog loses the Machine pointer sections

## 2.6.4 -- 2026-10-22

- Sign-in dialog redesign and on-screen keyboard; single floating panel for power actions; risk bar on one line; Jog gear and scrollbar; side tabs transition

## 2.6.3 -- 2026-10-21

- PIN sign enters by itself when the PIN has the length that worked last time

## 2.6.2 -- 2026-10-21

- GET roles: Vision reads follow the machine's roles (viewer needs the camera), page sends the identity on /frame.jpg

## Unreleased

- GET of the Vision server follows the roles when the machine has users: a viewer needs the camera, operator and above read, unclassified paths need technician; header-less images use the valid day key; the frame request sends the identity headers

## 2.6.1 -- 2026-10-21

- Vision requests carry the identity; page routes in English

## 2.6.0 -- 2026-10-21

- Operator guided calibration and technician advanced view, identity token on every call, laser-cross calibration needs technician

## 2.5.2 -- 2026-10-21

- Pin dsf-python==3.6.0 so the backend matches the DSF 3.6 API

## 2.5.1 -- 2026-10-21

- Page reloads when the DWC language changes; Vision pins dsf-python below 3.7; meter wizard copy over http

## 2.5.0 -- 2026-10-21

- English migration: texts through the catalog, no in-browser translator, interfaces per part

## 2.4.1 -- 2026-10-20

- English names: remaining values, ids, theme panels and the Vision backend keys (fixes a mismatch with the page)

## 2.4.0 -- 2026-10-20

- All the code, data keys and enum values are in English; stored data is converted by the one-off migration script

## 2.3.8 -- 2026-10-19

- Dimension lines of a part near the image edge are drawn inside the part instead of outside the picture

## 2.3.7 -- 2026-10-18

- Internal: local names in English (no visible change)

## 2.3.6 -- 2026-10-18

- Neutral Spanish texts

## 2.3.5 -- 2026-10-18

- Start-up entry is a chip in the page header

## 2.3.4 -- 2026-10-17

- Machine free rule follows the movement owner settings (like Duet / release seconds)

## 2.3.3 -- 2026-10-17

- Rebuild with the no-monoliths refactor

## 2.3.2 -- 2026-10-16

- Start-up strip directly under the header card, like the other pages (it was inside the card)

## 2.3.1 -- 2026-10-16

- Start-up dialog: sans-serif font, dark scrollbars, and a card with a single ready row no longer repeats its name

## 2.3.0 -- 2026-10-16

- Start-up card is now a dialog opened from a strip on the page (one card per function, progress, step-by-step assistant), with a plain explanation for every row

## 2.2.7 -- 2026-10-16

- Start-up assistant (shared piece), Lights: the strip pin is chosen in Advanced (plain LED removed)

## 2.2.6 -- 2026-10-15

- Start-up card (shared piece): Printing assistant renamed so it no longer collides with the card

## 2.2.5 -- 2026-10-15

- Rebuilt with the shared start-up card piece

## 2.2.4 -- 2026-10-15

- Spanish texts with accents and enie

## 2.2.3 -- 2026-10-14

- Hide every mention of another plugin when it is absent

## 2.2.2 -- 2026-10-14

- Cleanup: no more lookups of the old service Id (PiCustomCodes) or mentions of the removed custom G-codes

## 2.2.1 -- 2026-10-14

- Header like the other pages: same padding and no extra line under the title (the purpose is its tooltip)

## 2.2.0 -- 2026-10-13

- When the relay of the Pi does not answer Vision reads the ESP32-CAM of its camera directly, with snapshots at a low rate (4 per second), one reader per camera, backoff when it fails, and it goes back to the relay by itself

## 2.1.2 -- 2026-10-13

- The loading message covers the camera area with a dark background and the image stays hidden until it arrives (no white box while loading)

## 2.1.1 -- 2026-10-13

- Files and macros written by the plugin are in English; bilingual risk texts

## 2.1.0 -- 2026-10-13

- Official localization completed; the Vision page and its menu icon follow the common design line

## 2.0.0 -- 2026-10-13

- Needs WorkshopService 2.0: calls its central API (POST /machine/WorkshopService/api) instead of the custom codes M9003 / M9010, which are gone
- Photo lights and the fire notice through the API with the local key; the calibration with crosses and the search of marks reserve the machine while they move
- Includes the i18n helper fix of 1.x (the helper no longer clashes with local variables named tt)


## 1.20.0 -- 2026-10-13

- Official DWC localization and build pipeline

## 1.19.2 -- 2026-10-13

- Fewer IPC calls, system wording

## 1.19.1 -- 2026-10-12

- Llama con parada inmediata o cuenta de 2 s, humo con cuenta de 10 s, sensibilidad y plazo protegidos durante un trabajo, confirmacion al mover con trabajo en vivo quieto; dwcVersion 3.6

## 1.19.0 -- 2026-10-12

- Vision sin HTTP: estado y G-code por dsf-python (una sola suscripcion a DSF, permisos minimos), humo con cuenta regresiva y registro, sin nombre de programa en los textos

## 1.18.0 -- 2026-10-12

- Humo: cuenta regresiva con boton Cancelar y barra en todas las pantallas, accion protegida durante un trabajo, deteccion mas robusta (referencia movil, 8 s, ignora el punto del laser) y registro con fotos; depende de WorkshopService en la Pi; dwcVersion 3.6

## 1.17.7 -- 2026-10-11

- Barra de trabajo bajo la imagen con el estilo de la Mesa de trabajo (bloques, menus Vista / Buscar / Ajustes, nombres automaticos)

## 1.17.6 -- 2026-10-11

- Traducciones del detalle del PID

## 1.17.5 -- 2026-10-11

- Traducciones nuevas; el traductor tambien cubre Impresion 3D, Timelapses y Servicio de la Pi

## 1.17.4 -- 2026-10-11

- Con zoom menos las columnas se ajustan: lo que la imagen no usa pasa a las opciones

## 1.17.3 -- 2026-10-11

- Camara y opciones siempre lado a lado (salvo celular): la imagen se achica para hacer lugar

## 1.17.2 -- 2026-10-11

- El aviso de que falta la Mesa de trabajo nombra el complemento nuevo (WorkshopWorkbench)

## 1.17.1 -- 2026-10-11

- Declara la dependencia de WorkshopService

## 1.17.0 -- 2026-10-11

- Visor: regla en mm, controles dentro del marco, foto o en vivo claro, sin salto al cargar

## 1.16.2 -- 2026-10-11

- Si el panel de la derecha baja, la imagen ocupa todo el ancho

## 1.16.1 -- 2026-10-11

- La imagen se centra cuando el panel de la derecha baja (pantallas angostas)

## 1.16.0 -- 2026-10-11

- Carpetas en ingles bajo 0:/sys/workshop (datos, disenos, malla, cortar por partes); arreglos de la Mesa de trabajo

## 1.15.0 -- 2026-10-11

- Id nuevo en ingles (Workshop...) y guardado seguro ante cortes de luz

# TallerVision -- historial de versiones

## 1.14.3 -- 2026-10-11

- Compatibilidad con los Id nuevos en ingles (etapa 1, sin cambiar el Id); Motores: tabla de referencias del techo de pulsos

## 1.14.2 -- 2026-10-10

- Tema claro: circulos del asistente y textos del panel Mover

## 1.14.1 -- 2026-10-10

- Panel derecho llena el ancho; subtitulo de las cruces; lista Antes de calibrar con el tablero

## 1.14.0 -- 2026-10-10

- Asistente de calibracion y metodos nuevos: hoja A4, tablero de ajedrez con correccion de lente, mas patrones de cruces

## 1.13.5 -- 2026-10-10

- Imagen girada como parado frente a la maquina; panel derecho en una columna; proteccion visible en el panel Mover

## 1.13.4 -- 2026-10-10

- Pantalla completa propia del visor y fila de Buscar entera

## 1.13.3 -- 2026-10-10

- Visor: panel Mover con datos, se arrastra y se pliega; Buscar como boton con lista; pantalla completa real; texto del BLTouch

## 1.13.2 -- 2026-10-10

- En Mover las flechas siguen la direccion real de cada eje en la imagen

## 1.13.1 -- 2026-10-10

- GET /orientacion para el modo Auto de la camara flotante

## 1.13.0 -- 2026-10-10

- Visor de Vision redisenado: barra de arriba (herramienta, vista, zoom, cuadricula, guardar, pantalla completa), zoom y desplazamiento, X/Y del mouse y herramienta Mover

## 1.12.0 -- 2026-10-10

- Con contrasena en DWC el servicio pide la clave de la camara

## 1.11.6 -- 2026-10-10

- Fuego: la camara de la tarjeta muestra lo que analiza la vigilancia en tiempo real

## 1.11.5 -- 2026-10-10

- Medir piezas altas: se indica la altura de la pieza y la medida se corrige (un vaso de 8 cm ya no mide 13)

## 1.11.4 -- 2026-10-10

- Fuego: mientras vigila (o en la prueba en vivo) la tarjeta muestra la camara en vivo

## 1.11.3 -- 2026-10-10

- Fuego: en Probar, lo blanco muy brillante se marca en violeta

## 1.11.2 -- 2026-10-10

- Fuego: esta camara ve las llamas blancas

## 1.11.1 -- 2026-10-10

- Fuego: detecta el centro blanco de una llama chica (480 px, umbrales mas chicos, descuenta el punto del laser); aviso de uso, Prueba en vivo de 2 min y Probar mas claro; Paso a paso muestra el texto de cada paso

## 1.11.0 -- 2026-10-10

- Rediseno: barra lateral con 8 secciones en 3 grupos, Paso a paso, En vivo (seguimiento de pieza y cabezal), Piezas guardadas, Al Editor laser y Descargar SVG; los agujeros traen su contorno en mm; avisos claros sin servicio

## 1.10.4 -- 2026-10-10

- La barra roja de riesgo activo y los carteles de confirmacion se ven tambien en pantalla completa

## 1.10.3 -- 2026-10-10

- API: POST /config {camara_en: puente|carro} para el selector del mapa

## 1.10.2 -- 2026-10-10

- Estilo comun segun DESIGN.md (alto de botones, colores de la paleta, encabezados); traducciones

## 1.10.1 -- 2026-10-10

- Dependencias con una sola condicion (la 1.10.0 no se instalaba: el instalador de DSF rechaza >=a,<b)

## 1.10.0 -- 2026-10-10

- Vision instalable desde DWC: el servicio OpenCV pasa a ser el backend del plugin (antes un servicio aparte del sistema); funciones nuevas: vigilancia de fuego y humo, usar el material como area de corte, cotas con informe, plantillas por material, antes y despues, seguimiento del cabezal, corte por registro y foto de la cama de fondo del mapa

## 1.9.3 -- 2026-10-10

- Los comandos de la pagina van por HTTP desde el primero (antes salian por G-code mientras cargaban los plugins) y reintentan ~15 s si el servicio se esta reiniciando

## 1.9.2 -- 2026-10-10

- Camara en vivo en el mapa de Zonas, pantalla completa y Hallar centro; estilo comun (colores de pantalla, pestanas como v-tabs, Offsets en un solo lugar)

## 1.9.1 -- 2026-10-10

- Registro de plugins: el modulo de advertencias ya no pisa window.__taller (ningun plugin JS arrancaba). Las calibraciones y ajustes guardados quedan anotados en Actividad

## 1.9.0 -- 2026-10-10

- Estandar de advertencias: lo que solo mueve pide doble toque ambar; lo que puede dañar (sondas, Z0, laser, malla, marcas) un toque y el cartel; soltar motores, cartel rojo con casilla y aviso de riesgo activo (barra roja y LEDs). Nombre visible del servicio: Servicio de la Pi

## 1.8.1 -- 2026-10-10

- Las paginas mandan sus comandos M9000/M9003/M9010 por HTTP al servicio de la Pi (sin la cola de la Duet); si el servicio no lo tiene, vuelven al G-code

## 1.8.0 -- 2026-10-10

- Pagina Vision traducida al ingles. Comandos M9003 en ingles; los nombres en español siguen como alias; traducciones al ingles completas

## 1.7.2 -- 2026-10-10

- El boton Analizar no cambia de ancho; la pagina usa todo el ancho al alejar el zoom

## 1.7.1 -- 2026-10-10

- El interruptor En Zonas de trabajo dice Si/No y se pinta entero cuando esta activo

## 1.7.0 -- 2026-10-10

- Vision con tema claro

## 1.6.1 -- 2026-10-10

- Linea de diseno comun en el panel (colores, letra minima 10 px); avisos de riesgo: cartel Continuar/Cancelar antes de mover la maquina sola, usar la sonda, encender el laser, bajar a Z0, soltar o probar motores o reiniciar la placa

## 1.6.0 -- 2026-10-10

- Ajustes: donde va la camara (puente o carro); el plan de fotos centra tambien en X

## 1.5.1 -- 2026-10-10

- Comun: diccionario de ingles actualizado

## 1.5.0 -- 2026-10-10

- Ajustes: exposicion de la foto de medicion (automatica, ajustar sola, compensar, manual) y luz para la foto (luz de trabajo + zonas extra de Luces); en un mosaico la luz sigue prendida entre fotos; avisos de foto quemada u oscura

## 1.4.1 -- 2026-10-10

- Los avisos de DWC (errores, M291) ya no quedan detras de los paneles ni del mapa de Zonas

## 1.4.0 -- 2026-10-10

- Vista redisenada: tres pestanas (Medir, Calibrar, Ajustes); herramientas, fuente de la imagen y medida en curso sobre la imagen; foto de medicion en 3 pasos con el plan como datos; detecciones con filtro por tipo, medida grande y acciones con iconos; calibracion con resumen y metodos en acordeon; Fotos, Camara y Mapa de Zonas en Ajustes

## 1.3.3 -- 2026-10-10

- Boton Usar en Zonas de trabajo a la vista, en el encabezado de Vision

## 1.3.2 -- 2026-10-10

- Tira de LEDs: el texto dice si muestra los LEDs de estado o toda la tira (cuando la iluminacion tiene el control)

## 1.3.1 -- 2026-10-10

- Comun: traducciones nuevas al ingles y tira de LEDs completa solo con la iluminacion al mando

## 1.3.0 -- 2026-10-10

- Camara: interruptor Usar en Zonas de trabajo y opacidad para el mapa de Zonas (unico lugar donde se configura la camara)

## 1.2.1 -- 2026-10-10

- Calibrar: Recalibrar sin laser (reusa las cruces ya marcadas); se guarda donde se marcaron

## 1.2.0 -- 2026-10-10

- Calibrar: boton de calibracion automatica con cruces del laser (marca 6 cruces, las busca con fotos antes/despues, calcula la altura y comprueba); progreso en vivo, cancelar, guardar

## 1.1.0 -- 2026-10-09

- Foto de medicion: la camara va en el puente; calcula Y/Z (la Z mas baja que encuadra la zona, el area de corte, toda la cama o un rectangulo), mueve con visionpose.g (doble toque), mosaico en Y; calibracion por resolucion y a dos alturas

## 1.0.1 -- 2026-10-09

- Reconstruido con el helper compartido de LEDs actualizado (LEDs visibles tambien con el automatico apagado); sin cambios propios

# TallerVision

## 1.0.0
- Pagina Vision: detecta pieza, rectangulos, circulos, agujeros, esquinas, bordes y marcas ArUco con el servicio taller-vision (OpenCV en la Pi); medir distancia y area sobre la imagen; vista corregida desde arriba; calibracion con marcas ArUco o puntos a mano; acciones ir con el puntero, origen de zona, posicion y retazo

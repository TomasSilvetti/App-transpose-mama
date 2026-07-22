# Transpose

App de escritorio para practicar canciones de YouTube en otro tono. Pegás un link, movés el tono,
practicás con el audio ya transportado y lo descargás en MP3 con los cambios incluidos.

## Qué hace

- **Video sincronizado** con el audio transportado, para seguir la letra en pistas de karaoke.
  Calidad elegible: solo audio, 360p, 720p o 1080p.
- **Portada y ficha** de la canción a partir del link.
- **Transposición de ±12 semitonos**, aplicada en vivo mientras suena.
- **Velocidad de 0.5× a 1.5× sin desafinar**: se puede practicar más lento manteniendo el tono.
- **Controles de reproducción**: play/pausa, ±10 segundos, volver al inicio, barra de posición y volumen.
- **Descarga en MP3** con el tono y la velocidad elegidos. Suena exactamente igual a lo que se
  venía practicando, porque reproducción y exportación usan el mismo motor de audio.
- **Descarga en MP4** con el video y el audio ya transportado, para practicar la letra fuera de la app.
- **Historial en localStorage**: cada canción recuerda el tono con el que se practicó.

## Por qué es de escritorio y no una web

YouTube dejó de entregar el audio por URLs directas (migró al protocolo SABR) y además bloquea las
IPs de datacenter, que son las que usan Vercel, AWS y similares. Una versión web alojada fallaría al
descargar el audio.

Se verificó en su momento: incluso generando un PoToken válido de BotGuard, YouTube devuelve los
formatos sin URL. Los sitios que sí lo logran combinan `yt-dlp` con granjas de proxies residenciales
pagos, y arrastran antecedentes legales (yout.com perdió su juicio contra la RIAA).

Corriendo en la computadora del usuario, el pedido sale por una IP hogareña común y `yt-dlp`
funciona sin proxies ni trucos.

## yt-dlp siempre al día

YouTube cambia seguido y `yt-dlp` publica parches cada pocos días. La app se encarga sola:

- Al abrirse consulta la última versión publicada en GitHub, como máximo una vez por día.
- Si hay una nueva, la descarga antes de habilitar el botón de cargar canciones.
- El binario vive en la carpeta de datos del usuario, no requiere permisos de administrador.
- Si no hay internet o GitHub falla, sigue usando la versión ya descargada en vez de quedar inutilizable.

## Actualizaciones automáticas

La app busca versiones nuevas en las releases de GitHub cada vez que se abre, las descarga en
segundo plano y las instala al cerrarse. No hay que pasar instaladores a mano.

Para publicar una versión nueva:

```bash
npm version patch      # o minor / major
git push --follow-tags
```

El tag dispara el workflow de GitHub Actions, que verifica tipos, estilo y el motor de
transposición, compila el instalador y lo publica como release. De ahí lo toman las apps instaladas.

La instalación queda para el cierre a propósito: interrumpir a alguien que está practicando sería
peor que esperar a la próxima vez que abra el programa. El botón "Reiniciar ahora" solo adelanta ese
momento.

Las descargas son diferenciales gracias al `.blockmap` que publica electron-builder: si solo cambió
el código de la app, se bajan unos pocos MB y no el instalador entero.

## Cuando YouTube pide iniciar sesión

YouTube rechaza pedidos de forma intermitente con un *"Please sign in"*, aunque el video sea
público: el mismo link que falla anda al reintentar. La app reintenta sola hasta cuatro veces,
alternando el cliente que usa `yt-dlp`.

La secuencia salió de medirla, no de suponerla. Sobre un video que fallaba seguido:

| Configuración | Éxitos |
|---|---|
| `default` | 2/4 |
| `android_vr,ios,tv_embedded` | 2/4 |
| `tv,web_safari,mweb` | **0/4** ← descartada |
| Alternando las dos primeras, con 1.5s entre intentos | **6/6** |

## Binarios externos

Ninguno viaja dentro del instalador: se descargan a la carpeta de datos del usuario cuando hacen
falta, sin permisos de administrador.

| Binario | Cuándo se descarga | Peso |
|---|---|---|
| `yt-dlp` | Al abrir la app | ~18 MB |
| `ffmpeg` | La primera vez que se guarda un video | ~73 MB |

Quien solo use MP3 nunca descarga `ffmpeg`. Empaquetarlo habría sumado esos megas al instalador de
todos, y `yt-dlp` además necesita actualizarse por su cuenta.

## Desarrollo

```bash
npm install
npm run dev          # Next en :3000 + ventana de Electron, con recarga en caliente
```

| Script | Para qué |
|---|---|
| `npm run dev` | Desarrollo con la ventana de Electron |
| `npm run dev:web` | Solo la UI en el navegador (sin descargas ni guardado) |
| `npm run build` | Export estático de la UI a `out/` |
| `npm run dist` | Instalador de Windows en `release/` |
| `npm run smoke` | Recorre el flujo completo automatizado sobre la UI compilada |
| `npm run verify:pitch` | Verifica numéricamente el motor de transposición |

### Verificaciones

`npm run verify:pitch` genera un tono puro de 440 Hz, lo procesa y mide la frecuencia resultante:

```
original     : 440 Hz (esperado 440)
 12 semitonos: 880 Hz (esperado 880) -> desvio 0.0% OK
  7 semitonos: 659 Hz (esperado 659) -> desvio 0.0% OK
-12 semitonos: 220 Hz (esperado 220) -> desvio 0.0% OK

-- tempo (el tono NO debe cambiar) --
tempo 0.5x: 440 Hz | duracion x1.95 (esperado x2.00) TONO OK
tempo 1.5x: 440 Hz | duracion x0.65 (esperado x0.67) TONO OK
```

`npm run smoke` abre la app compilada y recorre el camino real del usuario: pegar el link, esperar la
descarga, subir tres semitonos, reproducir y exportar el MP3, verificando la cabecera del archivo.

## Cómo está armado

```
electron/
  main.js            Proceso principal: ventana e IPC
  preload.js         Puente seguro hacia el renderer (contextIsolation)
  ytdlp.js           Descarga y autoactualización de yt-dlp
  static-server.js   Sirve la UI compilada por HTTP local
  media-server.js    Sirve el video descargado, con soporte de Range para el seek
  smoke.js           Prueba end-to-end automatizada
src/
  components/        UI
  hooks/             Reproductor con transposición y exportación a MP3
  workers/           Codificación de MP3 fuera del hilo principal
  lib/               Parseo de links, localStorage, utilidades
```

Decisiones que conviene no revertir sin entender el motivo:

- **Una sola invocación de `yt-dlp` por canción.** Pedir los metadatos y el audio por separado hace
  que YouTube responda `403 Forbidden` en la segunda llamada. La portada se muestra igual de rápido
  usando la miniatura pública `i.ytimg.com`, que no necesita extracción.
- **La UI se sirve por HTTP local, no por `file://`.** Bajo `file://` se rompen los Web Workers y los
  módulos ES, y la exportación de MP3 depende de ambos.
- **Los botones de tono usan ajuste relativo.** Calcular el valor durante el render hace que varios
  clicks seguidos lean el mismo estado y se pierdan todos menos uno.
- **El video se descarga sin su pista de audio.** Como el audio va aparte —lo procesa el motor de
  transposición— no hace falta combinarlos, y eso evita depender de `ffmpeg`, que sumaría unos 80 MB
  al instalador. El `<video>` va mudo y sigue el reloj del audio.
- **El video se sirve por HTTP local, no por IPC.** Mandarlo como `ArrayBuffer` cargaría decenas de
  megabytes en memoria y perdería el seek nativo.
- **Al exportar video, el audio viaja como WAV.** Mandarlo ya comprimido obligaría a `ffmpeg` a
  recomprimirlo, sumando una segunda pérdida. Así hay una sola compresión, la final a AAC.
- **Sin cambio de velocidad el video se copia sin recomprimir** (`-c:v copy`), que es instantáneo.
  Solo cuando el tempo cambia hay que reajustar los tiempos con `setpts` y volver a codificar.

## Uso personal

Descargar contenido de YouTube va contra sus términos de servicio. Esta app está pensada para
practicar música en el equipo propio, no para redistribuir.

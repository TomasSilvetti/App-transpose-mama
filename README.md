# Transpose

App de escritorio para practicar canciones de YouTube en otro tono. Pegás un link, movés el tono,
practicás con el audio ya transportado y lo descargás en MP3 con los cambios incluidos.

## Qué hace

- **Portada y ficha** de la canción a partir del link.
- **Transposición de ±12 semitonos**, aplicada en vivo mientras suena.
- **Velocidad de 0.5× a 1.5× sin desafinar**: se puede practicar más lento manteniendo el tono.
- **Controles de reproducción**: play/pausa, ±10 segundos, volver al inicio, barra de posición y volumen.
- **Descarga en MP3** con el tono y la velocidad elegidos. Suena exactamente igual a lo que se
  venía practicando, porque reproducción y exportación usan el mismo motor de audio.
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

## Uso personal

Descargar contenido de YouTube va contra sus términos de servicio. Esta app está pensada para
practicar música en el equipo propio, no para redistribuir.

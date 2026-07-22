/**
 * Recorre el flujo completo sobre la app empaquetada usando la interfaz real:
 * pegar el link, esperar la descarga, transportar, reproducir y exportar el MP3.
 * Se ejecuta con TRANSPOSE_SMOKE=1.
 */
const SMOKE_URL = process.env.TRANSPOSE_SMOKE_URL || "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

const fs = require("node:fs");

module.exports = function runSmoke({ app, BrowserWindow }) {
  const report = (payload) => {
    const text = JSON.stringify(payload, null, 2);
    console.log("\n===== SMOKE =====\n" + text + "\n=================\n");
    try {
      fs.writeFileSync("smoke-result.json", text, "utf8");
    } catch {}
  };

  app.whenReady().then(async () => {
    // La ventana se crea en un callback async del main, puede no existir todavía.
    let win = null;
    for (let attempt = 0; attempt < 200 && !win; attempt += 1) {
      win = BrowserWindow.getAllWindows()[0] ?? null;
      if (!win) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!win) {
      report({ fatal: "no se creó la ventana" });
      app.exit(1);
      return;
    }

    const consoleErrors = [];

    // Ya no hay diálogos nativos que mockear: las descargas van solas a la carpeta fija,
    // así que el smoke verifica los archivos reales que quedan ahí.
    const nodePath = require("node:path");
    const downloadsDir = nodePath.join(app.getPath("music"), "Transpose");

    /** Archivo más reciente con esa extensión, para identificar el que dejó esta corrida. */
    const latestDownload = (extension) => {
      let newest = null;
      for (const name of fs.readdirSync(downloadsDir)) {
        if (!name.toLowerCase().endsWith(extension)) continue;
        const filePath = nodePath.join(downloadsDir, name);
        const stat = fs.statSync(filePath);
        if (!newest || stat.mtimeMs > newest.stat.mtimeMs) newest = { name, filePath, stat };
      }
      return newest;
    };

    win.webContents.on("console-message", (event) => {
      if (event.level === "error") consoleErrors.push(event.message);
    });

    await new Promise((resolve) => win.webContents.once("did-finish-load", resolve));

    const script = `(async () => {
      const out = { steps: [] };
      const log = (k, v) => out.steps.push(k + ": " + v);
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));

      const until = async (label, check, timeout = 180000) => {
        const started = Date.now();
        for (;;) {
          const value = check();
          if (value) return value;
          if (Date.now() - started > timeout) {
            const error = new Error("timeout esperando " + label);
            error.pasos = out.steps;
            error.pantalla = document.body.innerText.replace(/\\n+/g, " | ").slice(0, 600);
            throw error;
          }
          await wait(250);
        }
      };

      out.bridge = typeof window.transpose === "object";
      log("render", document.querySelector("h1")?.textContent?.slice(0, 30) ?? "SIN H1");

      const input = document.querySelector("#url");
      // React monta sus fibers al hidratar; antes de eso el formulario ignora lo que se escriba.
      await until("hidratacion", () => Object.keys(input).some((k) => k.startsWith("__react")), 30000);
      log("hidratacion", "ok");

      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;

      // El formulario puede no estar escuchando aunque React ya haya hidratado, así que
      // se reintenta hasta que el envío prospere en vez de fallar por una carrera.
      let intentos = 0;
      for (;;) {
        intentos += 1;
        setter.call(input, ${JSON.stringify(SMOKE_URL)});
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await wait(400);
        document.querySelector("form").requestSubmit();
        await wait(1200);

        const rechazado = [...document.querySelectorAll('[role="alert"]')].some((n) =>
          n.textContent.includes("Pegá un link"));
        if (!rechazado) break;
        if (intentos >= 8) throw new Error("el formulario nunca aceptó el link");
      }
      log("submit", "aceptado en intento " + intentos);

      await until("portada", () => document.querySelector("img[alt^='Portada']"));
      log("portada", document.querySelector("img[alt^='Portada']").alt);

      const playButton = await until("controles", () =>
        document.querySelector("button[aria-label='Reproducir']"));
      log("descarga+decode", "listo");

      const videoEl = document.querySelector("video");
      log("video presente", videoEl ? "si" : "NO HAY <video>");
      if (videoEl) {
        await until("metadata del video", () => videoEl.readyState >= 1, 30000);
        log("video", videoEl.videoWidth + "x" + videoEl.videoHeight + ", " + videoEl.duration.toFixed(0) + "s");
      }

      // Tres clicks sincrónicos: si los handlers leen estado viejo, se pierden dos.
      const up = document.querySelector("button[aria-label='Subir un semitono']");
      up.click(); up.click(); up.click();
      await wait(400);
      const valor = document.querySelector(".text-4xl")?.textContent;
      log("transpose 3 clicks", valor === "+3" ? "+3 ok" : "ESPERABA +3, HAY " + valor);

      const down = document.querySelector("button[aria-label='Bajar un semitono']");
      down.click();
      await wait(300);
      log("bajar 1", document.querySelector(".text-4xl")?.textContent);

      playButton.click();
      await wait(3000);
      const clock = document.querySelector("div.tabular-nums span")?.textContent;
      log("reproduccion", clock && clock !== "0:00" ? "avanzo a " + clock : "NO AVANZO (" + clock + ")");

      if (videoEl) {
        log("video reproduciendo", videoEl.paused ? "PAUSADO (falla)" : "si, en " + videoEl.currentTime.toFixed(2) + "s");

        // El reloj visible está redondeado a segundos, así que un desfase puntual no dice nada.
        // Lo que importa es si crece con el tiempo: eso sería deriva real.
        const leer = () => {
          const t = document.querySelector("div.tabular-nums span")?.textContent || "0:00";
          const [m, s] = t.split(":").map(Number);
          return videoEl.currentTime - (m * 60 + s);
        };
        const d1 = leer();
        await wait(6000);
        const d2 = leer();
        const deriva = Math.abs(d2 - d1);
        log("deriva en 6s", deriva.toFixed(2) + "s " + (deriva <= 0.5 ? "OK (estable)" : "CRECE"));
      }

      document.querySelector("button[aria-label='Pausar']")?.click();
      await wait(400);
      if (videoEl) log("pausa arrastra al video", videoEl.paused ? "si" : "NO (falla)");

      const buttons = [...document.querySelectorAll("button")];
      const download = buttons.find((b) => b.textContent.includes("Descargar MP3"));
      download.click();
      log("export", "disparado");

      await until("mp3 guardado", () =>
        document.body.innerText.includes("Mostrar en la carpeta"), 240000);
      log("mp3", "guardado");

      // La descarga tiene que aparecer sola en la biblioteca, que se lee del disco.
      const enBiblioteca = await until("cancion en Descargadas", () =>
        [...document.querySelectorAll("button[aria-label^='Borrar ']")].length, 30000);
      log("biblioteca", enBiblioteca + " cancion(es) listadas");

      // Exportar video descarga ffmpeg la primera vez, así que se le da margen amplio.
      const videoBtn = [...document.querySelectorAll("button")]
        .find((b) => b.textContent.includes("Descargar video"));
      if (!videoBtn || videoBtn.disabled) {
        log("export video", "BOTON NO DISPONIBLE");
        return out;
      }

      videoBtn.click();
      log("export video", "disparado");

      // Al arrancar una exportación se limpia el aviso de guardado anterior; cuando reaparece,
      // es porque esta terminó y escribió el archivo.
      const sinAviso = () => !document.body.innerText.includes("Mostrar en la carpeta");
      const falla = () => {
        const alerta = [...document.querySelectorAll('[role="alert"]')]
          .map((n) => n.textContent).join(" ");
        if (alerta.trim()) throw new Error("error en pantalla: " + alerta.slice(0, 300));
      };

      await until("inicio de la exportacion de video", () => { falla(); return sinAviso(); }, 60000);
      log("exportacion arrancada", document.body.innerText.match(/conversor[^.]*/i)?.[0] ?? "sin descarga de ffmpeg");

      await until("video exportado", () => { falla(); return !sinAviso(); }, 900000);
      log("video exportado", "listo");

      return out;
    })()`;

    const result = await win.webContents.executeJavaScript(script).catch(async (error) => ({
      fatal: error.message,
      pantalla: await win.webContents
        .executeJavaScript("document.body.innerText.replace(/\\n+/g,' | ').slice(0,600)")
        .catch(() => null),
    }));

    const savedMp3 = latestDownload(".mp3");
    if (savedMp3) {
      const head = Buffer.alloc(2);
      const fd = fs.openSync(savedMp3.filePath, "r");
      fs.readSync(fd, head, 0, 2, 0);
      fs.closeSync(fd);
      result.mp3 = {
        nombre: savedMp3.name,
        kb: Math.round(savedMp3.stat.size / 1024),
        cabeceraValida: head[0] === 0xff && (head[1] & 0xe0) === 0xe0,
      };
    }

    try {
      const savedVideo = latestDownload(".mp4");
      const stat = savedVideo.stat;
      const head = Buffer.alloc(12);
      const fd = fs.openSync(savedVideo.filePath, "r");
      fs.readSync(fd, head, 0, 12, 0);
      fs.closeSync(fd);
      result.video = {
        nombre: savedVideo.name,
        mb: (stat.size / 1048576).toFixed(1),
        contenedorMp4: head.subarray(4, 8).toString() === "ftyp",
      };

      // El video se descarga sin pista de audio, así que si el MP4 tiene una,
      // necesariamente es la que generó el motor de transposición.
      const probe = require("node:path").join(app.getPath("userData"), "ffmpeg", "ffprobe.exe");
      if (fs.existsSync(probe)) {
        const out = require("node:child_process").execFileSync(
          probe,
          ["-v", "error", "-show_entries", "stream=codec_type,codec_name,duration,channels",
           "-of", "json", savedVideo.filePath],
          { encoding: "utf8" },
        );
        result.video.pistas = JSON.parse(out).streams.map(
          (s) => `${s.codec_type}/${s.codec_name}` +
                 (s.channels ? ` ${s.channels}ch` : "") +
                 (s.duration ? ` ${Number(s.duration).toFixed(1)}s` : ""),
        );
      }

      // El archivo queda en la biblioteca: es una descarga real, no un temporal del smoke.
    } catch {
      result.video = "no se generó archivo";
    }

    if (consoleErrors.length) result.erroresDeConsola = consoleErrors;
    report(result);
    app.exit(result?.fatal ? 1 : 0);
  });
};

/**
 * Recorre el flujo completo sobre la app empaquetada usando la interfaz real:
 * pegar el link, esperar la descarga, transportar, reproducir y exportar el MP3.
 * Se ejecuta con TRANSPOSE_SMOKE=1.
 */
const SMOKE_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

const fs = require("node:fs");

module.exports = function runSmoke({ app, BrowserWindow, ipcMain }) {
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
    let savedMp3 = null;

    // Reemplaza el diálogo nativo, que bloquearía la corrida sin intervención.
    ipcMain.removeHandler("file:save-mp3");
    ipcMain.handle("file:save-mp3", (_event, { fileName, data }) => {
      savedMp3 = { fileName, bytes: Buffer.from(data) };
      return { saved: true, filePath: "C:/smoke/" + fileName };
    });

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
            out.pantallaAlFallar = document.body.innerText.replace(/\\n+/g, " | ").slice(0, 600);
            throw new Error("timeout esperando " + label);
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
      setter.call(input, ${JSON.stringify(SMOKE_URL)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await wait(300);
      document.querySelector("form").requestSubmit();
      log("submit", "enviado con valor=" + (input.value ? "si" : "NO"));

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

      return out;
    })()`;

    const result = await win.webContents.executeJavaScript(script).catch(async (error) => ({
      fatal: error.message,
      pantalla: await win.webContents
        .executeJavaScript("document.body.innerText.replace(/\\n+/g,' | ').slice(0,600)")
        .catch(() => null),
    }));

    if (savedMp3) {
      const { bytes } = savedMp3;
      result.mp3 = {
        nombre: savedMp3.fileName,
        kb: Math.round(bytes.length / 1024),
        cabeceraValida: bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0,
      };
    }

    if (consoleErrors.length) result.erroresDeConsola = consoleErrors;
    report(result);
    app.exit(result?.fatal ? 1 : 0);
  });
};

const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { YtDlpManager } = require("./ytdlp");
const { startStaticServer } = require("./static-server");
const { MediaServer } = require("./media-server");
const { FfmpegManager } = require("./ffmpeg");
const { setupUpdater } = require("./updater");

// El smoke corre sin empaquetar pero debe ejercer la UI compilada, no el dev server.
const isDev = !app.isPackaged && process.env.TRANSPOSE_SMOKE !== "1";
const DEV_URL = "http://localhost:3000";

let mainWindow = null;
let ytdlp = null;
let ffmpeg = null;
let updater = null;
let readyPromise = null;
const media = new MediaServer();
// Ruta del video de la canción abierta, necesaria para exportarlo con el audio nuevo.
let currentVideoFile = null;

const VIDEO_ID = /^[\w-]{11}$/;

const QUALITY_HEIGHT = { "360": 360, "720": 720, "1080": 1080 };

/**
 * El audio siempre va aparte porque lo procesa el motor de transposición. Eso permite
 * usar pistas de video sin audio y evita depender de ffmpeg para combinarlas.
 */
function buildFormatSelector(quality) {
  const audio = "bestaudio[ext=m4a]/bestaudio";
  const height = QUALITY_HEIGHT[quality];
  if (!height) return audio;

  // avc1 primero: se decodifica por hardware, a diferencia de AV1.
  const video = [
    `bestvideo[height<=${height}][vcodec^=avc1][ext=mp4]`,
    `bestvideo[height<=${height}][ext=mp4]`,
    `bestvideo[height<=${height}]`,
  ].join("/");

  return `${audio},${video}`;
}

function assertVideoId(videoId) {
  if (typeof videoId !== "string" || !VIDEO_ID.test(videoId)) {
    throw new Error("Id de video inválido.");
  }
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

/** Una sola preparación de yt-dlp por sesión, compartida por todas las llamadas. */
function ensureYtDlp() {
  readyPromise ??= ytdlp
    .ensureReady((message) => send("ytdlp:status", { phase: "preparing", message }))
    .then((result) => {
      send("ytdlp:status", {
        phase: "ready",
        version: result.version,
        updated: result.updated,
        warning: result.warning ?? null,
      });
      return result;
    })
    .catch((error) => {
      readyPromise = null;
      send("ytdlp:status", { phase: "error", message: error.message });
      throw error;
    });
  return readyPromise;
}

async function resolveAppUrl() {
  if (isDev) return DEV_URL;
  const { port } = await startStaticServer(path.join(__dirname, "..", "out"));
  return `http://127.0.0.1:${port}/index.html`;
}

function createWindow(appUrl) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 960,
    minHeight: 700,
    backgroundColor: "#0b0f19",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  // Los links externos van al navegador del sistema, nunca dentro de la app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  void mainWindow.loadURL(appUrl);
}

app.whenReady().then(async () => {
  ytdlp = new YtDlpManager(app.getPath("userData"));
  ffmpeg = new FfmpegManager(app.getPath("userData"));
  const appUrl = await resolveAppUrl();
  createWindow(appUrl);
  void ensureYtDlp().catch(() => {});

  updater = setupUpdater({ app, send });
  void updater.checkNow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(appUrl);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  void media.clear();
});

ipcMain.handle("ytdlp:ensure", async () => {
  const result = await ensureYtDlp();
  return { version: result.version, warning: result.warning ?? null };
});

/** Traduce la salida de yt-dlp a algo accionable para quien está usando la app. */
function describeDownloadError(message = "") {
  if (/please sign in|sign in to confirm|not a bot/i.test(message)) {
    return "YouTube nos pidió iniciar sesión para este video. Suele ser pasajero: probá de nuevo en unos segundos.";
  }
  if (/private video/i.test(message)) return "Este video es privado.";
  if (/video unavailable|not available/i.test(message)) {
    return "Este video no está disponible. Puede haber sido borrado o tener restricciones por país.";
  }
  if (/age|confirm your age/i.test(message)) {
    return "Este video tiene restricción de edad y YouTube no lo entrega sin iniciar sesión.";
  }
  if (/members-only|join this channel/i.test(message)) {
    return "Este video es solo para miembros del canal.";
  }
  if (/live event will begin|is live/i.test(message)) {
    return "Es una transmisión en vivo, no se puede usar hasta que termine.";
  }
  if (/getaddrinfo|network|timed out|connection/i.test(message)) {
    return "No pudimos conectarnos a YouTube. Revisá tu conexión a internet.";
  }
  return "No pudimos descargar esta canción. Probá de nuevo o con otro video.";
}

/**
 * Metadatos y audio en una sola corrida de yt-dlp. Separarlo en dos invocaciones hace que
 * YouTube responda 403 en la segunda, así que la ficha y el archivo salen juntos.
 */
ipcMain.handle("video:load", async (_event, videoId, quality = "720") => {
  const url = assertVideoId(videoId);
  await ensureYtDlp();

  // La canción anterior deja de usarse en cuanto empieza otra.
  await media.clear();

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "transpose-"));
  let keepFiles = false;

  try {
    await ytdlp.runWithFallback(
      [
        "--no-playlist",
        "--no-warnings",
        "--newline",
        "--progress",
        "--write-info-json",
        "--extractor-retries",
        "3",
        "-f",
        buildFormatSelector(quality),
        "-o",
        path.join(workDir, "media.%(ext)s"),
        url,
      ],
      {
        onLine: (line) => {
          const match = line.match(/\[download\]\s+([\d.]+)%/);
          if (match) send("video:progress", { videoId, progress: Number(match[1]) / 100 });
        },
        onRetry: (intento, total) =>
          send("video:retry", { videoId, intento, total }),
      },
    );

    const files = await fs.readdir(workDir);
    const infoFile = files.find((name) => name.endsWith(".info.json"));
    const audioFile = files.find((name) => /\.(m4a|webm|opus|mp3)$/i.test(name));
    const videoFile = files.find((name) => /\.(mp4|mkv)$/i.test(name));
    if (!audioFile) throw new Error("yt-dlp no dejó ningún archivo de audio.");

    const meta = infoFile
      ? JSON.parse(await fs.readFile(path.join(workDir, infoFile), "utf8"))
      : {};
    const buffer = await fs.readFile(path.join(workDir, audioFile));

    let videoUrl = null;
    currentVideoFile = null;
    if (videoFile) {
      await media.start();
      currentVideoFile = path.join(workDir, videoFile);
      videoUrl = media.publish(currentVideoFile);
      keepFiles = true;
    }

    return {
      info: {
        videoId,
        title: meta.title ?? "Video de YouTube",
        author: meta.uploader ?? meta.channel ?? "",
        thumbnail: meta.thumbnail ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        duration: Math.round(meta.duration ?? 0),
      },
      audio: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      videoUrl,
    };
  } catch (error) {
    throw new Error(describeDownloadError(error.message));
  } finally {
    // El video se sigue leyendo desde disco mientras se reproduce; el audio ya está en memoria.
    if (!keepFiles) await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
});

ipcMain.handle("file:save-mp3", async (_event, { fileName, data }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Guardar MP3",
    defaultPath: path.join(app.getPath("music"), fileName),
    filters: [{ name: "MP3", extensions: ["mp3"] }],
  });

  if (result.canceled || !result.filePath) return { saved: false };

  await fs.writeFile(result.filePath, Buffer.from(data));
  return { saved: true, filePath: result.filePath };
});

ipcMain.handle("file:reveal", async (_event, filePath) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle("app:version", () => app.getVersion());

ipcMain.handle("update:install", () => {
  updater?.installNow();
});

/** Duración en segundos que tendrá el audio ya procesado, para no cortar el video de más. */
function parseFfmpegTime(line) {
  const match = line.match(/time=(\d+):(\d+):(\d+\.?\d*)/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

ipcMain.handle("video:export", async (_event, { fileName, wav, tempo, durationSeconds }) => {
  if (!currentVideoFile) {
    throw new Error("Esta canción se abrió sin video. Elegí una calidad de video y volvé a cargarla.");
  }

  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Guardar video",
    defaultPath: path.join(app.getPath("videos"), fileName),
    filters: [{ name: "Video MP4", extensions: ["mp4"] }],
  });
  if (result.canceled || !result.filePath) return { saved: false };

  await ffmpeg.ensureReady((status) => send("export:status", status));

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "transpose-export-"));
  const audioPath = path.join(workDir, "audio.wav");

  try {
    await fs.writeFile(audioPath, Buffer.from(wav));

    const args = ["-y", "-i", currentVideoFile, "-i", audioPath, "-map", "0:v:0", "-map", "1:a:0"];

    if (tempo === 1) {
      // Sin cambio de velocidad el video sirve tal cual: copiarlo evita recomprimirlo.
      args.push("-c:v", "copy");
    } else {
      // Al cambiar la velocidad el audio dura distinto, así que el video se reajusta con él.
      args.push(
        "-filter:v",
        `setpts=PTS/${tempo}`,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
      );
    }

    args.push("-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", result.filePath);

    send("export:status", { phase: "encoding", message: "Uniendo video y audio…", progress: 0 });

    await ffmpeg.run(args, {
      onLine: (line) => {
        const seconds = parseFfmpegTime(line);
        if (seconds !== null && durationSeconds > 0) {
          send("export:status", {
            phase: "encoding",
            message: "Uniendo video y audio…",
            progress: Math.min(0.99, seconds / durationSeconds),
          });
        }
      },
    });

    send("export:status", { phase: "done", message: "Listo", progress: 1 });
    return { saved: true, filePath: result.filePath };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
});

if (process.env.TRANSPOSE_SMOKE === "1") require("./smoke")({ app, BrowserWindow, ipcMain });

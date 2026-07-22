const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { YtDlpManager } = require("./ytdlp");
const { startStaticServer } = require("./static-server");

// El smoke corre sin empaquetar pero debe ejercer la UI compilada, no el dev server.
const isDev = !app.isPackaged && process.env.TRANSPOSE_SMOKE !== "1";
const DEV_URL = "http://localhost:3000";

let mainWindow = null;
let ytdlp = null;
let readyPromise = null;

const VIDEO_ID = /^[\w-]{11}$/;

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
  const appUrl = await resolveAppUrl();
  createWindow(appUrl);
  void ensureYtDlp().catch(() => {});

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(appUrl);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("ytdlp:ensure", async () => {
  const result = await ensureYtDlp();
  return { version: result.version, warning: result.warning ?? null };
});

/**
 * Metadatos y audio en una sola corrida de yt-dlp. Separarlo en dos invocaciones hace que
 * YouTube responda 403 en la segunda, así que la ficha y el archivo salen juntos.
 */
ipcMain.handle("video:load", async (_event, videoId) => {
  const url = assertVideoId(videoId);
  await ensureYtDlp();

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "transpose-"));

  try {
    await ytdlp.run(
      [
        "--no-playlist",
        "--no-warnings",
        "--newline",
        "--progress",
        "--write-info-json",
        "-f",
        "bestaudio[ext=m4a]/bestaudio",
        "-o",
        path.join(workDir, "audio.%(ext)s"),
        url,
      ],
      {
        onLine: (line) => {
          const match = line.match(/\[download\]\s+([\d.]+)%/);
          if (match) send("video:progress", { videoId, progress: Number(match[1]) / 100 });
        },
      },
    );

    const files = await fs.readdir(workDir);
    const infoFile = files.find((name) => name.endsWith(".info.json"));
    const audioFile = files.find((name) => !name.endsWith(".info.json"));
    if (!audioFile) throw new Error("yt-dlp no dejó ningún archivo de audio.");

    const meta = infoFile
      ? JSON.parse(await fs.readFile(path.join(workDir, infoFile), "utf8"))
      : {};
    const buffer = await fs.readFile(path.join(workDir, audioFile));

    return {
      info: {
        videoId,
        title: meta.title ?? "Video de YouTube",
        author: meta.uploader ?? meta.channel ?? "",
        thumbnail: meta.thumbnail ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        duration: Math.round(meta.duration ?? 0),
      },
      audio: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
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

if (process.env.TRANSPOSE_SMOKE === "1") require("./smoke")({ app, BrowserWindow, ipcMain });

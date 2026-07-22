const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const { createWriteStream } = require("node:fs");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const { Readable } = require("node:stream");
const AdmZip = require("adm-zip");

const RELEASE_API = "https://api.github.com/repos/yt-dlp/FFmpeg-Builds/releases/latest";

/**
 * ffmpeg solo hace falta para exportar video con el audio transportado. Se descarga la
 * primera vez que se usa en lugar de empaquetarlo, para no sumarle ~70 MB al instalador
 * de quienes nunca usen esa función.
 */
class FfmpegManager {
  constructor(userDataPath) {
    this.dir = path.join(userDataPath, "ffmpeg");
    this.binaryPath = path.join(this.dir, "ffmpeg.exe");
  }

  async exists() {
    try {
      await fs.access(this.binaryPath);
      return true;
    } catch {
      return false;
    }
  }

  async findAsset() {
    const response = await fetch(RELEASE_API, {
      headers: { "user-agent": "transpose-app", accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error(`GitHub respondió ${response.status}`);
    const data = await response.json();

    // El build "shared" pesa menos de la mitad que el estático; las DLL van en la misma carpeta.
    const asset = (data.assets ?? []).find((item) =>
      /win64-gpl-shared\.zip$/i.test(item.name),
    );
    if (!asset) throw new Error("No encontramos un build de ffmpeg para este sistema.");
    return asset;
  }

  async ensureReady(onStatus = () => {}) {
    if (await this.exists()) return this.binaryPath;

    onStatus({ phase: "preparing", message: "Buscando el conversor de video…" });
    const asset = await this.findAsset();
    const totalMb = (asset.size / 1048576).toFixed(0);

    onStatus({
      phase: "downloading",
      message: `Descargando el conversor de video (${totalMb} MB, una sola vez)…`,
      progress: 0,
    });

    await fs.mkdir(this.dir, { recursive: true });
    const zipPath = path.join(this.dir, "ffmpeg.zip");

    const response = await fetch(asset.browser_download_url, {
      headers: { "user-agent": "transpose-app" },
    });
    if (!response.ok || !response.body) {
      throw new Error(`No pudimos descargar ffmpeg (${response.status})`);
    }

    let received = 0;
    const reportingStream = new TransformStream({
      transform(chunk, controller) {
        received += chunk.byteLength;
        onStatus({
          phase: "downloading",
          message: `Descargando el conversor de video (${totalMb} MB, una sola vez)…`,
          progress: asset.size ? received / asset.size : 0,
        });
        controller.enqueue(chunk);
      },
    });

    await pipeline(
      Readable.fromWeb(response.body.pipeThrough(reportingStream)),
      createWriteStream(zipPath),
    );

    onStatus({ phase: "extracting", message: "Preparando el conversor…" });

    // Solo interesa la carpeta bin/, que trae el ejecutable y sus DLL.
    const zip = new AdmZip(zipPath);
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const match = entry.entryName.match(/(?:^|\/)bin\/([^/]+)$/);
      if (!match) continue;
      await fs.writeFile(path.join(this.dir, match[1]), entry.getData());
    }

    await fs.rm(zipPath, { force: true });

    if (!(await this.exists())) {
      throw new Error("El paquete de ffmpeg no contenía el ejecutable esperado.");
    }

    return this.binaryPath;
  }

  run(args, { onLine } = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.binaryPath, args, { windowsHide: true });
      let stderr = "";
      let pending = "";

      // ffmpeg reporta el progreso por stderr.
      child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        stderr += text;
        if (!onLine) return;
        pending += text;
        const lines = pending.split(/\r?\n|\r/);
        pending = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) onLine(line.trim());
      });

      child.on("error", (error) => reject(new Error(`No pudimos ejecutar ffmpeg: ${error.message}`)));
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr.trim().split("\n").slice(-4).join(" ") || `ffmpeg salió con ${code}`));
      });
    });
  }
}

module.exports = { FfmpegManager };

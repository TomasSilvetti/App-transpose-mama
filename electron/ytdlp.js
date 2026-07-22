const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const { createWriteStream } = require("node:fs");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const { Readable } = require("node:stream");

const RELEASE_API = "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Nombre del binario publicado por yt-dlp para la plataforma actual. */
function assetName() {
  if (process.platform === "win32") return "yt-dlp.exe";
  if (process.platform === "darwin") return "yt-dlp_macos";
  return "yt-dlp";
}

class YtDlpManager {
  constructor(userDataPath) {
    this.binDir = path.join(userDataPath, "bin");
    this.binaryPath = path.join(this.binDir, assetName());
    this.metaPath = path.join(userDataPath, "ytdlp-meta.json");
  }

  async readMeta() {
    try {
      return JSON.parse(await fs.readFile(this.metaPath, "utf8"));
    } catch {
      return { version: null, checkedAt: 0 };
    }
  }

  async writeMeta(meta) {
    await fs.writeFile(this.metaPath, JSON.stringify(meta, null, 2), "utf8");
  }

  async binaryExists() {
    try {
      await fs.access(this.binaryPath);
      return true;
    } catch {
      return false;
    }
  }

  async fetchLatestRelease() {
    const response = await fetch(RELEASE_API, {
      headers: { "user-agent": "transpose-app", accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error(`GitHub respondió ${response.status}`);
    const data = await response.json();
    const asset = (data.assets ?? []).find((item) => item.name === assetName());
    if (!asset) throw new Error("No encontramos el binario de yt-dlp para este sistema.");
    return { version: data.tag_name, url: asset.browser_download_url };
  }

  async downloadBinary(url) {
    await fs.mkdir(this.binDir, { recursive: true });
    const response = await fetch(url, { headers: { "user-agent": "transpose-app" } });
    if (!response.ok || !response.body) throw new Error(`No pudimos descargar yt-dlp (${response.status})`);

    // Se escribe aparte y se renombra para no dejar un binario a medias si se corta la descarga.
    const tempPath = `${this.binaryPath}.download`;
    await pipeline(Readable.fromWeb(response.body), createWriteStream(tempPath));
    await fs.rename(tempPath, this.binaryPath);
    if (process.platform !== "win32") await fs.chmod(this.binaryPath, 0o755);
  }

  /**
   * Garantiza un yt-dlp usable. Busca actualizaciones una vez por día; si la red falla
   * y ya hay un binario descargado, sigue con ese en lugar de dejar la app inutilizable.
   */
  async ensureReady(onStatus = () => {}) {
    const meta = await this.readMeta();
    const exists = await this.binaryExists();
    const isStale = Date.now() - (meta.checkedAt ?? 0) > CHECK_INTERVAL_MS;

    if (exists && !isStale) {
      return { ready: true, version: meta.version, updated: false };
    }

    try {
      onStatus(exists ? "Buscando actualizaciones…" : "Preparando el descargador…");
      const latest = await this.fetchLatestRelease();

      if (exists && latest.version === meta.version) {
        await this.writeMeta({ ...meta, checkedAt: Date.now() });
        return { ready: true, version: meta.version, updated: false };
      }

      onStatus(exists ? `Actualizando a ${latest.version}…` : `Descargando ${latest.version}…`);
      await this.downloadBinary(latest.url);
      await this.writeMeta({ version: latest.version, checkedAt: Date.now() });
      return { ready: true, version: latest.version, updated: true };
    } catch (error) {
      if (exists) {
        return { ready: true, version: meta.version, updated: false, warning: error.message };
      }
      throw new Error(
        `No pudimos preparar el descargador de audio: ${error.message}. Revisá tu conexión a internet.`,
      );
    }
  }

  /**
   * YouTube rechaza pedidos de forma intermitente: el mismo video que falla vuelve a andar
   * al reintentar. Estos son los errores que valen un segundo intento en vez de rendirse.
   */
  static isTransient(message) {
    return /please sign in|sign in to confirm|http error 403|http error 429|unable to download|failed to extract|precondition check failed|not a bot/i.test(
      message,
    );
  }

  /**
   * Reintenta rotando el cliente de YouTube que usa yt-dlp. Cuando uno queda marcado,
   * otro suele responder sin pedir autenticación.
   */
  async runWithFallback(args, { onLine, onRetry } = {}) {
    // Secuencia elegida midiendo tasa de éxito sobre un video que fallaba de forma intermitente:
    // alternar estos dos clientes resolvió 6 de 6 intentos. Otras combinaciones probadas
    // (tv, web_safari, mweb) fallaron siempre, así que quedaron afuera.
    const alternate = ["--extractor-args", "youtube:player_client=android_vr,ios,tv_embedded"];
    const variants = [[], alternate, [], alternate];

    let lastError = null;

    for (let index = 0; index < variants.length; index += 1) {
      try {
        return await this.run([...args, ...variants[index]], { onLine });
      } catch (error) {
        lastError = error;
        if (!YtDlpManager.isTransient(error.message) || index === variants.length - 1) break;
        onRetry?.(index + 1, variants.length);
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    throw lastError;
  }

  run(args, { onLine } = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.binaryPath, args, { windowsHide: true });
      let stdout = "";
      let stderr = "";
      let pending = "";

      child.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        stdout += text;
        if (!onLine) return;
        pending += text;
        const lines = pending.split(/\r?\n|\r/);
        pending = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) onLine(line.trim());
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => reject(new Error(`No pudimos ejecutar yt-dlp: ${error.message}`)));
      child.on("close", (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(stderr.trim() || `yt-dlp terminó con código ${code}`));
      });
    });
  }
}

module.exports = { YtDlpManager };

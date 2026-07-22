const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const MIME = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".m4a": "audio/mp4",
};

/**
 * Sirve los archivos de video descargados al elemento `<video>` del renderer.
 * Pasarlos por IPC obligaría a cargar decenas de megabytes en memoria y perdería el
 * seek nativo, así que se exponen por HTTP en loopback con soporte de `Range`.
 */
class MediaServer {
  constructor() {
    this.files = new Map();
    this.server = null;
    this.port = null;
  }

  async start() {
    if (this.server) return this.port;

    this.server = http.createServer((request, response) => {
      const token = decodeURIComponent(new URL(request.url, "http://localhost").pathname.slice(1));
      const filePath = this.files.get(token)?.filePath;

      if (!filePath) {
        response.writeHead(404).end("Not found");
        return;
      }

      let size;
      try {
        size = fs.statSync(filePath).size;
      } catch {
        response.writeHead(404).end("Not found");
        return;
      }

      const type = MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
      const range = request.headers.range;

      // Sin Range el navegador no puede saltar a una posición del video.
      if (range) {
        const match = /bytes=(\d*)-(\d*)/.exec(range);
        const start = match?.[1] ? Number(match[1]) : 0;
        const end = match?.[2] ? Number(match[2]) : size - 1;

        if (start >= size || end >= size || start > end) {
          response.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
          return;
        }

        response.writeHead(206, {
          "Content-Type": type,
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": end - start + 1,
        });
        fs.createReadStream(filePath, { start, end }).pipe(response);
        return;
      }

      response.writeHead(200, {
        "Content-Type": type,
        "Content-Length": size,
        "Accept-Ranges": "bytes",
      });
      fs.createReadStream(filePath).pipe(response);
    });

    await new Promise((resolve, reject) => {
      this.server.on("error", reject);
      this.server.listen(0, "127.0.0.1", resolve);
    });

    this.port = this.server.address().port;
    return this.port;
  }

  /**
   * `temporary` marca los archivos que viven en una carpeta descartable. Los permanentes
   * (la biblioteca de descargas) se publican igual, pero `clear` no toca su carpeta.
   */
  publish(filePath, { temporary = true } = {}) {
    const token = crypto.randomUUID();
    this.files.set(token, { filePath, temporary });
    return `http://127.0.0.1:${this.port}/${token}`;
  }

  /** Olvida los archivos publicados y borra las carpetas temporales que los contenían. */
  async clear() {
    const dirs = new Set(
      [...this.files.values()].filter((entry) => entry.temporary).map((entry) => path.dirname(entry.filePath)),
    );
    this.files.clear();
    await Promise.all(
      [...dirs].map((dir) => fsp.rm(dir, { recursive: true, force: true }).catch(() => {})),
    );
  }
}

module.exports = { MediaServer };

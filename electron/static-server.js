const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

/**
 * Sirve el export estático de Next por HTTP en loopback. Cargar la UI por `file://`
 * rompe los Web Workers y los módulos ES, así que producción usa el mismo esquema que `next dev`.
 */
function startStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (request, response) => {
      try {
        const requestUrl = new URL(request.url, "http://localhost");
        let relativePath = decodeURIComponent(requestUrl.pathname);
        if (relativePath.endsWith("/")) relativePath += "index.html";

        const resolved = path.join(rootDir, relativePath);
        // Impide que una ruta con `..` escape del directorio publicado.
        if (!resolved.startsWith(rootDir)) {
          response.writeHead(403).end("Forbidden");
          return;
        }

        let filePath = resolved;
        try {
          await fs.access(filePath);
        } catch {
          filePath = `${resolved}.html`;
          try {
            await fs.access(filePath);
          } catch {
            response.writeHead(404).end("Not found");
            return;
          }
        }

        const body = await fs.readFile(filePath);
        response.writeHead(200, {
          "Content-Type": MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
          "Cache-Control": "no-store",
        });
        response.end(body);
      } catch (error) {
        response.writeHead(500).end(String(error));
      }
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
  });
}

module.exports = { startStaticServer };

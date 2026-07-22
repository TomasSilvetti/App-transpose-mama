const fs = require("node:fs/promises");
const path = require("node:path");

const AUDIO_EXTENSIONS = new Set([".mp3"]);
const VIDEO_EXTENSIONS = new Set([".mp4"]);

/**
 * Biblioteca de descargas: una carpeta fija en Música donde quedan todas las canciones
 * guardadas. El disco es la fuente de verdad —lo que se borra desde el explorador
 * desaparece de la app— y un índice aparte recuerda los datos que el archivo no guarda
 * (video de origen, portada, tono y velocidad con los que se exportó).
 */
class DownloadsLibrary {
  constructor({ musicPath, userDataPath }) {
    this.dir = path.join(musicPath, "Transpose");
    this.indexPath = path.join(userDataPath, "downloads-index.json");
  }

  async ensureDir() {
    await fs.mkdir(this.dir, { recursive: true });
    return this.dir;
  }

  async readIndex() {
    try {
      const parsed = JSON.parse(await fs.readFile(this.indexPath, "utf8"));
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  async writeIndex(index) {
    try {
      await fs.mkdir(path.dirname(this.indexPath), { recursive: true });
      await fs.writeFile(this.indexPath, JSON.stringify(index, null, 2));
    } catch {
      // Sin índice la biblioteca sigue listando los archivos, solo con menos datos.
    }
  }

  /** Evita pisar una descarga previa: "Canción.mp3" → "Canción (2).mp3". */
  async resolveTarget(fileName) {
    await this.ensureDir();
    const extension = path.extname(fileName);
    const base = path.basename(fileName, extension);

    for (let attempt = 1; ; attempt += 1) {
      const candidate = attempt === 1 ? `${base}${extension}` : `${base} (${attempt})${extension}`;
      const filePath = path.join(this.dir, candidate);
      try {
        await fs.access(filePath);
      } catch {
        return { fileName: candidate, filePath };
      }
    }
  }

  async record(fileName, meta) {
    const index = await this.readIndex();
    index[fileName] = { ...meta, savedAt: new Date().toISOString() };
    await this.writeIndex(index);
  }

  /** Solo acepta nombres sueltos: nada que pueda escapar de la carpeta de descargas. */
  resolveExisting(fileName) {
    if (typeof fileName !== "string" || path.basename(fileName) !== fileName) {
      throw new Error("Nombre de archivo inválido.");
    }
    return path.join(this.dir, fileName);
  }

  async list() {
    await this.ensureDir();
    const index = await this.readIndex();

    const entries = await fs.readdir(this.dir, { withFileTypes: true });
    const songs = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      const isAudio = AUDIO_EXTENSIONS.has(extension);
      if (!isAudio && !VIDEO_EXTENSIONS.has(extension)) continue;

      let stats;
      try {
        stats = await fs.stat(path.join(this.dir, entry.name));
      } catch {
        continue;
      }

      const meta = index[entry.name] ?? {};
      songs.push({
        fileName: entry.name,
        kind: isAudio ? "audio" : "video",
        sizeBytes: stats.size,
        // Sin entrada en el índice la fecha del archivo es lo más cercano a "cuándo la bajé".
        downloadedAt: (meta.savedAt ?? stats.mtime.toISOString()),
        title: meta.title ?? path.basename(entry.name, extension),
        author: meta.author ?? "",
        thumbnail: meta.thumbnail ?? null,
        videoId: meta.videoId ?? null,
        semitones: typeof meta.semitones === "number" ? meta.semitones : 0,
        tempo: typeof meta.tempo === "number" ? meta.tempo : 1,
      });
    }

    // El índice acumula entradas de archivos que el usuario ya borró a mano.
    const present = new Set(songs.map((song) => song.fileName));
    const pruned = Object.fromEntries(
      Object.entries(index).filter(([name]) => present.has(name)),
    );
    if (Object.keys(pruned).length !== Object.keys(index).length) await this.writeIndex(pruned);

    return songs.sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt));
  }

  async remove(fileName) {
    const filePath = this.resolveExisting(fileName);
    await fs.rm(filePath, { force: true });
    const index = await this.readIndex();
    delete index[fileName];
    await this.writeIndex(index);
  }
}

module.exports = { DownloadsLibrary };

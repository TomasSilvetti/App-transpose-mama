import type { VideoInfo, VideoQuality } from "@/lib/youtube";

export type DownloaderStatus =
  | { phase: "preparing"; message: string }
  | { phase: "ready"; version: string | null; updated: boolean; warning: string | null }
  | { phase: "error"; message: string };

export type ExportStatus = {
  phase: "preparing" | "downloading" | "extracting" | "encoding" | "done";
  message: string;
  progress?: number;
};

export type UpdateStatus =
  | { phase: "checking" }
  | { phase: "available"; version: string }
  | { phase: "downloading"; percent: number }
  | { phase: "ready"; version: string }
  | { phase: "none" }
  | { phase: "error"; message: string };

/** Una canción presente en la carpeta de descargas. */
export type DownloadedSong = {
  fileName: string;
  kind: "audio" | "video";
  sizeBytes: number;
  downloadedAt: string;
  title: string;
  author: string;
  thumbnail: string | null;
  videoId: string | null;
  semitones: number;
  tempo: number;
};

/** Datos que el archivo no guarda por sí solo y que la biblioteca recuerda aparte. */
export type DownloadMeta = {
  videoId: string | null;
  title: string;
  author: string;
  thumbnail: string | null;
  semitones: number;
  tempo: number;
};

export type TransposeApi = {
  ensureDownloader: () => Promise<{ version: string | null; warning: string | null }>;
  loadVideo: (
    videoId: string,
    quality: VideoQuality,
  ) => Promise<{ info: VideoInfo; audio: ArrayBuffer; videoUrl: string | null }>;
  saveMp3: (
    fileName: string,
    data: ArrayBuffer,
    meta: DownloadMeta,
  ) => Promise<{ saved: boolean; filePath?: string; fileName?: string }>;
  exportVideo: (payload: {
    fileName: string;
    wav: ArrayBuffer;
    tempo: number;
    durationSeconds: number;
    meta: DownloadMeta;
  }) => Promise<{ saved: boolean; filePath?: string; fileName?: string }>;
  revealFile: (filePath: string) => Promise<void>;

  listDownloads: () => Promise<DownloadedSong[]>;
  openDownload: (
    fileName: string,
  ) => Promise<{ info: VideoInfo; audio: ArrayBuffer; videoUrl: string | null }>;
  removeDownload: (fileName: string) => Promise<DownloadedSong[]>;
  revealDownload: (fileName: string) => Promise<void>;
  openDownloadsFolder: () => Promise<void>;
  getAppVersion: () => Promise<string>;
  getUpdateStatus: () => Promise<UpdateStatus>;
  installUpdate: () => Promise<void>;
  onExportStatus: (callback: (payload: ExportStatus) => void) => () => void;
  onUpdateStatus: (callback: (payload: UpdateStatus) => void) => () => void;
  onDownloadProgress: (
    callback: (payload: { videoId: string; progress: number }) => void,
  ) => () => void;
  onDownloadRetry: (
    callback: (payload: { videoId: string; intento: number; total: number }) => void,
  ) => () => void;
  onDownloaderStatus: (callback: (payload: DownloaderStatus) => void) => () => void;
};

declare global {
  interface Window {
    transpose?: TransposeApi;
  }
}

export {};

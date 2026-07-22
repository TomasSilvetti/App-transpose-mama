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

export type TransposeApi = {
  ensureDownloader: () => Promise<{ version: string | null; warning: string | null }>;
  loadVideo: (
    videoId: string,
    quality: VideoQuality,
  ) => Promise<{ info: VideoInfo; audio: ArrayBuffer; videoUrl: string | null }>;
  saveMp3: (
    fileName: string,
    data: ArrayBuffer,
  ) => Promise<{ saved: boolean; filePath?: string }>;
  exportVideo: (payload: {
    fileName: string;
    wav: ArrayBuffer;
    tempo: number;
    durationSeconds: number;
  }) => Promise<{ saved: boolean; filePath?: string }>;
  revealFile: (filePath: string) => Promise<void>;
  getAppVersion: () => Promise<string>;
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

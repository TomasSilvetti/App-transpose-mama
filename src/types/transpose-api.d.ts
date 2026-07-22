import type { VideoInfo } from "@/lib/youtube";

export type DownloaderStatus =
  | { phase: "preparing"; message: string }
  | { phase: "ready"; version: string | null; updated: boolean; warning: string | null }
  | { phase: "error"; message: string };

export type TransposeApi = {
  ensureDownloader: () => Promise<{ version: string | null; warning: string | null }>;
  loadVideo: (videoId: string) => Promise<{ info: VideoInfo; audio: ArrayBuffer }>;
  saveMp3: (
    fileName: string,
    data: ArrayBuffer,
  ) => Promise<{ saved: boolean; filePath?: string }>;
  revealFile: (filePath: string) => Promise<void>;
  onDownloadProgress: (
    callback: (payload: { videoId: string; progress: number }) => void,
  ) => () => void;
  onDownloaderStatus: (callback: (payload: DownloaderStatus) => void) => () => void;
};

declare global {
  interface Window {
    transpose?: TransposeApi;
  }
}

export {};

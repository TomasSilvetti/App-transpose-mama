const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("transpose", {
  ensureDownloader: () => ipcRenderer.invoke("ytdlp:ensure"),
  loadVideo: (videoId, quality) => ipcRenderer.invoke("video:load", videoId, quality),
  saveMp3: (fileName, data, meta) => ipcRenderer.invoke("file:save-mp3", { fileName, data, meta }),
  exportVideo: (payload) => ipcRenderer.invoke("video:export", payload),
  revealFile: (filePath) => ipcRenderer.invoke("file:reveal", filePath),

  listDownloads: () => ipcRenderer.invoke("downloads:list"),
  openDownload: (fileName) => ipcRenderer.invoke("downloads:open", fileName),
  removeDownload: (fileName) => ipcRenderer.invoke("downloads:remove", fileName),
  revealDownload: (fileName) => ipcRenderer.invoke("downloads:reveal", fileName),
  openDownloadsFolder: () => ipcRenderer.invoke("downloads:open-folder"),
  getAppVersion: () => ipcRenderer.invoke("app:version"),
  getUpdateStatus: () => ipcRenderer.invoke("update:status"),
  installUpdate: () => ipcRenderer.invoke("update:install"),

  onUpdateStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("update:status", listener);
    return () => ipcRenderer.off("update:status", listener);
  },

  onDownloadProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("video:progress", listener);
    return () => ipcRenderer.off("video:progress", listener);
  },

  onDownloadRetry: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("video:retry", listener);
    return () => ipcRenderer.off("video:retry", listener);
  },

  onDownloaderStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("ytdlp:status", listener);
    return () => ipcRenderer.off("ytdlp:status", listener);
  },

  onExportStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("export:status", listener);
    return () => ipcRenderer.off("export:status", listener);
  },
});

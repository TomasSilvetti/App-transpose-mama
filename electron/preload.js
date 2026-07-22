const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("transpose", {
  ensureDownloader: () => ipcRenderer.invoke("ytdlp:ensure"),
  loadVideo: (videoId, quality) => ipcRenderer.invoke("video:load", videoId, quality),
  saveMp3: (fileName, data) => ipcRenderer.invoke("file:save-mp3", { fileName, data }),
  revealFile: (filePath) => ipcRenderer.invoke("file:reveal", filePath),

  onDownloadProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("video:progress", listener);
    return () => ipcRenderer.off("video:progress", listener);
  },

  onDownloaderStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("ytdlp:status", listener);
    return () => ipcRenderer.off("ytdlp:status", listener);
  },
});

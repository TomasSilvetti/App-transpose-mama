const { autoUpdater } = require("electron-updater");

/**
 * Busca actualizaciones en las releases de GitHub al abrir la app y las descarga en segundo
 * plano. La instalación queda para el cierre: interrumpir a alguien que está practicando
 * sería peor que esperar a la próxima vez que abra el programa.
 */
function setupUpdater({ app, send }) {
  if (!app.isPackaged) return { checkNow: async () => null };

  autoUpdater.autoDownload = true;
  // Instalar al salir evita cortar la reproducción en curso.
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  autoUpdater.on("checking-for-update", () => {
    send("update:status", { phase: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    send("update:status", { phase: "available", version: info.version });
  });

  autoUpdater.on("update-not-available", () => {
    send("update:status", { phase: "none" });
  });

  autoUpdater.on("download-progress", (progress) => {
    send("update:status", {
      phase: "downloading",
      percent: Math.round(progress.percent),
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    send("update:status", { phase: "ready", version: info.version });
  });

  autoUpdater.on("error", (error) => {
    // Quedarse sin actualizar no debe impedir usar la app: se avisa y se sigue.
    send("update:status", { phase: "error", message: String(error?.message ?? error) });
  });

  return {
    checkNow: () => autoUpdater.checkForUpdates().catch(() => null),
    installNow: () => autoUpdater.quitAndInstall(),
  };
}

module.exports = { setupUpdater };

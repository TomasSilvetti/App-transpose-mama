const { autoUpdater } = require("electron-updater");

/**
 * Busca actualizaciones en las releases de GitHub al abrir la app y las descarga en segundo
 * plano. La instalación queda para el cierre: interrumpir a alguien que está practicando
 * sería peor que esperar a la próxima vez que abra el programa.
 */
function setupUpdater({ app, send }) {
  // El chequeo puede arrancar antes de que la ventana esté lista para recibir eventos, así
  // que se recuerda el último estado y se puede reenviar cuando la UI lo pida.
  let lastStatus = { phase: "none" };
  const emit = (status) => {
    lastStatus = status;
    send("update:status", status);
  };

  // En desarrollo no hay releases contra las cuales chequear, pero la UI igual necesita saber
  // que "está al día" en vez de quedarse esperando para siempre.
  if (!app.isPackaged) {
    return {
      checkNow: async () => null,
      getStatus: () => lastStatus,
    };
  }

  autoUpdater.autoDownload = true;
  // Instalar al salir evita cortar la reproducción en curso.
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  autoUpdater.on("checking-for-update", () => {
    emit({ phase: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    emit({ phase: "available", version: info.version });
  });

  autoUpdater.on("update-not-available", () => {
    emit({ phase: "none" });
  });

  autoUpdater.on("download-progress", (progress) => {
    emit({ phase: "downloading", percent: Math.round(progress.percent) });
  });

  autoUpdater.on("update-downloaded", (info) => {
    emit({ phase: "ready", version: info.version });
  });

  autoUpdater.on("error", (error) => {
    // Quedarse sin actualizar no debe impedir usar la app: se avisa y se sigue.
    emit({ phase: "error", message: String(error?.message ?? error) });
  });

  return {
    checkNow: () => autoUpdater.checkForUpdates().catch(() => null),
    installNow: () => autoUpdater.quitAndInstall(),
    getStatus: () => lastStatus,
  };
}

module.exports = { setupUpdater };

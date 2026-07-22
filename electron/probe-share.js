const fs = require("node:fs");
module.exports = function ({ app, BrowserWindow }) {
  app.whenReady().then(async () => {
    let win = null;
    for (let i = 0; i < 200 && !win; i++) { win = BrowserWindow.getAllWindows()[0] ?? null; if (!win) await new Promise(r=>setTimeout(r,100)); }
    await new Promise(r => win.webContents.once("did-finish-load", r));
    const out = await win.webContents.executeJavaScript(`(async () => {
      const r = {};
      r.hasShare = typeof navigator.share === "function";
      r.hasCanShare = typeof navigator.canShare === "function";
      r.secureContext = window.isSecureContext;
      r.origin = location.origin;
      if (r.hasCanShare) {
        try {
          const f = new File([new Uint8Array([1,2,3])], "t.mp3", { type: "audio/mpeg" });
          r.canShareFiles = navigator.canShare({ files: [f] });
        } catch(e) { r.canShareFiles = "err: " + e.message; }
      }
      return r;
    })()`).catch(e=>({fatal:e.message}));
    fs.writeFileSync("probe-share.json", JSON.stringify(out,null,2));
    app.exit(0);
  });
};

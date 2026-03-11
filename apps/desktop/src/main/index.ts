import { app, BrowserWindow, net, protocol } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

import { appTokens } from "../theme/appTokens";
import { registerIpc } from "./ipc";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PREVIEW_PROTOCOL = "stickersmith-media";

protocol.registerSchemesAsPrivileged([
  {
    scheme: PREVIEW_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function registerPreviewProtocol() {
  protocol.handle(PREVIEW_PROTOCOL, (request) => {
    const url = new URL(request.url);
    const filePath = url.searchParams.get("path");

    if (!filePath || !path.isAbsolute(filePath)) {
      return new Response("Invalid preview path", { status: 400 });
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: appTokens.layout.window.width,
    height: appTokens.layout.window.height,
    minWidth: appTokens.layout.window.minWidth,
    minHeight: appTokens.layout.window.minHeight,
    backgroundColor: appTokens.colors.background.app,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    void window.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  registerPreviewProtocol();
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

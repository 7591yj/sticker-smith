import { app, BrowserWindow, protocol } from "electron";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

import { registerIpc } from "./ipc";
import { PREVIEW_MIME_TYPES, PREVIEW_PROTOCOL } from "./config/constants";
import { env } from "./config/env";
import { windowConfig } from "./config/windowConfig";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  protocol.handle(PREVIEW_PROTOCOL, async (request) => {
    const url = new URL(request.url);
    const filePath = url.searchParams.get("path");

    if (!filePath || !path.isAbsolute(filePath)) {
      return new Response("Invalid preview path", { status: 400 });
    }

    try {
      const stats = await fs.stat(filePath);

      if (!stats.isFile()) {
        return new Response("Preview target is not a file", { status: 400 });
      }

      const contentType =
        PREVIEW_MIME_TYPES[path.extname(filePath).toLowerCase()] ??
        "application/octet-stream";
      const baseHeaders = {
        "accept-ranges": "bytes",
        "cache-control": "no-store",
        "content-type": contentType,
      };
      const rangeHeader = request.headers.get("range");

      if (!rangeHeader) {
        return new Response(
          Readable.toWeb(createReadStream(filePath)) as BodyInit,
          {
            headers: {
              ...baseHeaders,
              "content-length": String(stats.size),
            },
          },
        );
      }

      const range = parseRangeHeader(rangeHeader, stats.size);

      if (!range) {
        return new Response(null, {
          status: 416,
          headers: {
            ...baseHeaders,
            "content-range": `bytes */${stats.size}`,
          },
        });
      }

      const { start, end } = range;
      return new Response(
        Readable.toWeb(createReadStream(filePath, { start, end })) as BodyInit,
        {
          status: 206,
          headers: {
            ...baseHeaders,
            "content-length": String(end - start + 1),
            "content-range": `bytes ${start}-${end}/${stats.size}`,
          },
        },
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return new Response("Preview file not found", { status: 404 });
      }

      return new Response("Failed to load preview", { status: 500 });
    }
  });
}

function parseRangeHeader(
  rangeHeader: string,
  fileSize: number,
): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());

  if (!match) {
    return null;
  }

  const [, rawStart, rawEnd] = match;

  if (rawStart === "" && rawEnd === "") {
    return null;
  }

  if (rawStart === "") {
    const suffixLength = Number(rawEnd);

    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return null;
    }

    const start = Math.max(fileSize - suffixLength, 0);
    return { start, end: fileSize - 1 };
  }

  const start = Number(rawStart);
  const requestedEnd =
    rawEnd === "" ? fileSize - 1 : Math.min(Number(rawEnd), fileSize - 1);

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(requestedEnd) ||
    start < 0 ||
    start > requestedEnd ||
    start >= fileSize
  ) {
    return null;
  }

  return { start, end: requestedEnd };
}

function createWindow() {
  const window = new BrowserWindow({
    width: windowConfig.width,
    height: windowConfig.height,
    minWidth: windowConfig.minWidth,
    minHeight: windowConfig.minHeight,
    backgroundColor: windowConfig.backgroundColor,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (env.VITE_DEV_SERVER_URL) {
    void window.loadURL(env.VITE_DEV_SERVER_URL);
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

import { app, BrowserWindow, protocol, type BrowserWindowConstructorOptions } from "electron";
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

type PreviewHeaders = Record<"accept-ranges" | "cache-control" | "content-type", string>;

type ByteRange = { start: number; end: number };

function registerPreviewProtocol() {
  protocol.handle(PREVIEW_PROTOCOL, handlePreviewRequest);
}

async function handlePreviewRequest(request: Request): Promise<Response> {
  const filePath = getValidPreviewPath(request.url);

  if (!filePath) {
    return new Response("Invalid preview path", { status: 400 });
  }

  try {
    const stats = await fs.stat(filePath);

    if (!stats.isFile()) {
      return new Response("Preview target is not a file", { status: 400 });
    }

    return createPreviewResponse(filePath, stats.size, request.headers.get("range"));
  } catch (error) {
    return createPreviewErrorResponse(error);
  }
}

function getValidPreviewPath(requestUrl: string): string | null {
  const filePath = new URL(requestUrl).searchParams.get("path");

  if (!filePath || !path.isAbsolute(filePath)) {
    return null;
  }

  return filePath;
}

function createPreviewResponse(
  filePath: string,
  fileSize: number,
  rangeHeader: string | null,
): Response {
  const baseHeaders = getPreviewHeaders(filePath);

  if (!rangeHeader) {
    return createFullPreviewResponse(filePath, fileSize, baseHeaders);
  }

  return createRangePreviewResponse(filePath, fileSize, rangeHeader, baseHeaders);
}

function getPreviewHeaders(filePath: string): PreviewHeaders {
  return {
    "accept-ranges": "bytes",
    "cache-control": "no-store",
    "content-type":
      PREVIEW_MIME_TYPES[path.extname(filePath).toLowerCase()] ??
      "application/octet-stream",
  };
}

function createFullPreviewResponse(
  filePath: string,
  fileSize: number,
  baseHeaders: PreviewHeaders,
): Response {
  return new Response(Readable.toWeb(createReadStream(filePath)) as BodyInit, {
    headers: {
      ...baseHeaders,
      "content-length": String(fileSize),
    },
  });
}

function createRangePreviewResponse(
  filePath: string,
  fileSize: number,
  rangeHeader: string,
  baseHeaders: PreviewHeaders,
): Response {
  const range = parseRangeHeader(rangeHeader, fileSize);

  if (!range) {
    return new Response(null, {
      status: 416,
      headers: {
        ...baseHeaders,
        "content-range": `bytes */${fileSize}`,
      },
    });
  }

  return createPartialPreviewResponse(filePath, fileSize, range, baseHeaders);
}

function createPartialPreviewResponse(
  filePath: string,
  fileSize: number,
  range: ByteRange,
  baseHeaders: PreviewHeaders,
): Response {
  const { start, end } = range;

  return new Response(
    Readable.toWeb(createReadStream(filePath, { start, end })) as BodyInit,
    {
      status: 206,
      headers: {
        ...baseHeaders,
        "content-length": String(end - start + 1),
        "content-range": `bytes ${start}-${end}/${fileSize}`,
      },
    },
  );
}

function createPreviewErrorResponse(error: unknown): Response {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    return new Response("Preview file not found", { status: 404 });
  }

  return new Response("Failed to load preview", { status: 500 });
}

function parseRangeHeader(
  rangeHeader: string,
  fileSize: number,
): { start: number; end: number } | null {
  const parts = parseByteRangeParts(rangeHeader);

  if (!parts) {
    return null;
  }

  return parts.rawStart === ""
    ? parseSuffixByteRange(parts.rawEnd, fileSize)
    : parseExplicitByteRange(parts.rawStart, parts.rawEnd, fileSize);
}

function parseByteRangeParts(
  rangeHeader: string,
): { rawStart: string; rawEnd: string } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());

  if (!match) {
    return null;
  }

  const [, rawStart, rawEnd] = match;
  return rawStart === "" && rawEnd === "" ? null : { rawStart, rawEnd };
}

function parseSuffixByteRange(rawEnd: string, fileSize: number): ByteRange | null {
  const suffixLength = Number(rawEnd);

  if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
    return null;
  }

  return { start: Math.max(fileSize - suffixLength, 0), end: fileSize - 1 };
}

function parseExplicitByteRange(
  rawStart: string,
  rawEnd: string,
  fileSize: number,
): ByteRange | null {
  const start = Number(rawStart);
  const end = rawEnd === "" ? fileSize - 1 : Math.min(Number(rawEnd), fileSize - 1);

  return isValidExplicitByteRange(start, end, fileSize) ? { start, end } : null;
}

function isValidExplicitByteRange(start: number, end: number, fileSize: number): boolean {
  if (!hasFiniteRangeBounds(start, end)) {
    return false;
  }

  return start >= 0 && start <= end && start < fileSize;
}

function hasFiniteRangeBounds(start: number, end: number): boolean {
  return Number.isFinite(start) && Number.isFinite(end);
}

function getWindowTitleBarOptions(): Pick<
  BrowserWindowConstructorOptions,
  "titleBarOverlay" | "titleBarStyle" | "trafficLightPosition"
> {
  if (process.platform === "darwin") {
    return {
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 16, y: 18 },
    };
  }

  return {
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: windowConfig.backgroundColor,
      symbolColor: "#e4e4e7",
      height: 48,
    },
  };
}

function createWindow() {
  const window = new BrowserWindow({
    width: windowConfig.width,
    height: windowConfig.height,
    minWidth: windowConfig.minWidth,
    minHeight: windowConfig.minHeight,
    backgroundColor: windowConfig.backgroundColor,
    autoHideMenuBar: true,
    ...getWindowTitleBarOptions(),
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

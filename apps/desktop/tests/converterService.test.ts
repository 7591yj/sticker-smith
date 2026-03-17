import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ConversionJobEvent,
  StickerPackDetails,
} from "@sticker-smith/shared";

const { appMock, spawnMock } = vi.hoisted(() => ({
  appMock: {
    isPackaged: false,
    getAppPath: () => "/tmp/sticker-smith",
  },
  spawnMock: vi.fn(),
}));

vi.mock("electron", () => ({
  app: appMock,
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
  default: {
    spawn: spawnMock,
  },
}));

import { ConverterService } from "../src/main/services/converterService";

const originalResourcesPath = process.resourcesPath;
const originalPathEnv = process.env.PATH;
const originalAppDir = process.env.APPDIR;
const originalStickerSmithRoot = process.env.STICKER_SMITH_ROOT;
const originalBackendDir = process.env.STICKER_SMITH_BACKEND_DIR;
const originalFfmpegEnv = process.env.STICKER_SMITH_FFMPEG;
const originalFfprobeEnv = process.env.STICKER_SMITH_FFPROBE;
const originalPythonPathEnv = process.env.PYTHONPATH;
const originalStickerSmithPythonPathEnv = process.env.STICKER_SMITH_PYTHONPATH;
const tempDirectories: string[] = [];

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = { end: vi.fn() };
  killed = false;

  kill = vi.fn(() => {
    this.killed = true;
    return true;
  });
}

class FakeCommandProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = { end: vi.fn() };
  killed = false;

  constructor(private readonly exitCode: number) {
    super();
    queueMicrotask(() => {
      this.emit("close", this.exitCode);
    });
  }

  kill = vi.fn(() => {
    this.killed = true;
    this.emit("close", null);
    return true;
  });
}

async function createBundledBackend() {
  const resourcesPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "sticker-smith-backend-"),
  );
  const backendDirectory = path.join(resourcesPath, "backend");
  tempDirectories.push(resourcesPath);

  await fs.mkdir(backendDirectory, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(backendDirectory, "gui-api"), ""),
    fs.writeFile(path.join(backendDirectory, "ffmpeg"), ""),
    fs.writeFile(path.join(backendDirectory, "ffprobe"), ""),
  ]);

  return { resourcesPath, backendDirectory };
}

function getResolveBackendCommand(service: ConverterService) {
  return (
    service as unknown as {
      resolveBackendCommand: () => Promise<{
        command: string;
        args: string[];
        cwd: string;
        env: NodeJS.ProcessEnv;
      }>;
    }
  ).resolveBackendCommand();
}

async function waitForSpawn() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (spawnMock.mock.calls.length > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error("spawn was not called");
}

function createDetails(): StickerPackDetails {
  return {
    pack: {
      id: "pack-1",
      source: "local",
      name: "Sample Pack",
      slug: "sample-pack",
      rootPath: "/tmp/sample-pack",
      sourceRoot: "/tmp/sample-pack/source",
      outputRoot: "/tmp/sample-pack/webm",
      iconAssetId: "asset-3",
      thumbnailPath: null,
      createdAt: "2026-03-11T00:00:00.000Z",
      updatedAt: "2026-03-11T00:00:00.000Z",
    },
    assets: [
      {
        id: "asset-1",
        packId: "pack-1",
        order: 1,
        relativePath: "one.png",
        absolutePath: "/tmp/sample-pack/source/one.png",
        originalFileName: "one.png",
        emojiList: [],
        kind: "png",
        importedAt: "2026-03-11T00:00:00.000Z",
        originalImportPath: "/tmp/imports/one.png",
        downloadState: "ready",
      },
      {
        id: "asset-2",
        packId: "pack-1",
        order: 0,
        relativePath: "two.png",
        absolutePath: "/tmp/sample-pack/source/two.png",
        originalFileName: "two.png",
        emojiList: [],
        kind: "png",
        importedAt: "2026-03-11T00:00:00.000Z",
        originalImportPath: "/tmp/imports/two.png",
        downloadState: "ready",
      },
      {
        id: "asset-3",
        packId: "pack-1",
        order: 2,
        relativePath: "icon.png",
        absolutePath: "/tmp/sample-pack/source/icon.png",
        originalFileName: "icon.png",
        emojiList: [],
        kind: "png",
        importedAt: "2026-03-11T00:00:00.000Z",
        originalImportPath: "/tmp/imports/icon.png",
        downloadState: "ready",
      },
    ],
    outputs: [],
  };
}

function createEvent(assetId: string, outputPath: string): ConversionJobEvent {
  return {
    type: "asset_completed",
    jobId: "job-1",
    assetId,
    mode: "sticker",
    outputPath,
    sizeBytes: 128,
  };
}

function getExpectedStickerOutputPath(
  details: StickerPackDetails,
  assetId: string,
) {
  return path.join(details.pack.outputRoot, `${assetId}.webm`);
}

afterEach(() => {
  spawnMock.mockReset();
  appMock.isPackaged = false;
  Object.defineProperty(process, "resourcesPath", {
    configurable: true,
    value: originalResourcesPath,
  });
  process.env.PATH = originalPathEnv;
  if (originalAppDir === undefined) {
    delete process.env.APPDIR;
  } else {
    process.env.APPDIR = originalAppDir;
  }
  if (originalStickerSmithRoot === undefined) {
    delete process.env.STICKER_SMITH_ROOT;
  } else {
    process.env.STICKER_SMITH_ROOT = originalStickerSmithRoot;
  }
  if (originalBackendDir === undefined) {
    delete process.env.STICKER_SMITH_BACKEND_DIR;
  } else {
    process.env.STICKER_SMITH_BACKEND_DIR = originalBackendDir;
  }
  if (originalFfmpegEnv === undefined) {
    delete process.env.STICKER_SMITH_FFMPEG;
  } else {
    process.env.STICKER_SMITH_FFMPEG = originalFfmpegEnv;
  }
  if (originalFfprobeEnv === undefined) {
    delete process.env.STICKER_SMITH_FFPROBE;
  } else {
    process.env.STICKER_SMITH_FFPROBE = originalFfprobeEnv;
  }
  if (originalPythonPathEnv === undefined) {
    delete process.env.PYTHONPATH;
  } else {
    process.env.PYTHONPATH = originalPythonPathEnv;
  }
  if (originalStickerSmithPythonPathEnv === undefined) {
    delete process.env.STICKER_SMITH_PYTHONPATH;
  } else {
    process.env.STICKER_SMITH_PYTHONPATH = originalStickerSmithPythonPathEnv;
  }
  vi.restoreAllMocks();

  const cleanupTargets = tempDirectories.splice(0, tempDirectories.length);
  return Promise.all(
    cleanupTargets.map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("ConverterService", () => {
  it("records buffered completion events before the job resolves", async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child as never);

    const details = createDetails();
    const libraryService = {
      getConversionContext: vi.fn(async () => details),
      getPack: vi.fn(async () => details),
      recordConversionResult: vi.fn(async () => undefined),
    };
    const service = new ConverterService(libraryService as never);
    const emitSpy = vi.fn();

    service.setEventSink(emitSpy);
    vi.spyOn(
      service as unknown as {
        resolveBackendCommand: () => Promise<{
          command: string;
          args: string[];
          cwd: string;
          env: NodeJS.ProcessEnv;
        }>;
      },
      "resolveBackendCommand",
    ).mockResolvedValue({
      command: "gui-api",
      args: [],
      cwd: "/tmp",
      env: process.env,
    });

    const conversion = service.convertPack(details.pack.id);
    await waitForSpawn();
    child.stdout.emit(
      "data",
      Buffer.from(
        JSON.stringify(
          createEvent(
            "asset-1",
            getExpectedStickerOutputPath(details, "asset-1"),
          ),
        ),
      ),
    );
    child.emit("close", 0);

    await conversion;

    expect(libraryService.recordConversionResult).toHaveBeenCalledWith(
      details.pack.id,
      {
        assetId: "asset-1",
        mode: "sticker",
        outputFileName: "asset-1.webm",
        sizeBytes: 128,
      },
    );
    expect(emitSpy).toHaveBeenCalledWith(
      createEvent("asset-1", getExpectedStickerOutputPath(details, "asset-1")),
    );
  });

  it("serializes completion writes emitted in separate stdout chunks", async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child as never);

    const details = createDetails();
    let releaseFirstWrite = () => undefined;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const callOrder: string[] = [];

    const libraryService = {
      getConversionContext: vi.fn(async () => details),
      getPack: vi.fn(async () => details),
      recordConversionResult: vi.fn(
        async (_packId: string, result: { assetId: string }) => {
          callOrder.push(`start:${result.assetId}`);
          if (result.assetId === "asset-1") {
            await firstWrite;
          }
          callOrder.push(`end:${result.assetId}`);
        },
      ),
    };
    const service = new ConverterService(libraryService as never);

    vi.spyOn(
      service as unknown as {
        resolveBackendCommand: () => Promise<{
          command: string;
          args: string[];
          cwd: string;
          env: NodeJS.ProcessEnv;
        }>;
      },
      "resolveBackendCommand",
    ).mockResolvedValue({
      command: "gui-api",
      args: [],
      cwd: "/tmp",
      env: process.env,
    });

    const conversion = service.convertPack(details.pack.id);
    await waitForSpawn();
    child.stdout.emit(
      "data",
      Buffer.from(
        `${JSON.stringify(
          createEvent("asset-1", getExpectedStickerOutputPath(details, "asset-1")),
        )}\n`,
      ),
    );
    child.stdout.emit(
      "data",
      Buffer.from(
        `${JSON.stringify(
          createEvent("asset-2", getExpectedStickerOutputPath(details, "asset-2")),
        )}\n`,
      ),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(callOrder).toEqual(["start:asset-1"]);

    releaseFirstWrite();
    child.emit("close", 0);

    await conversion;

    expect(callOrder).toEqual([
      "start:asset-1",
      "end:asset-1",
      "start:asset-2",
      "end:asset-2",
    ]);
  });

  it("handles partial NDJSON chunks before flushing the final buffer", async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child as never);

    const details = createDetails();
    const libraryService = {
      getConversionContext: vi.fn(async () => details),
      getPack: vi.fn(async () => details),
      recordConversionResult: vi.fn(async () => undefined),
    };
    const service = new ConverterService(libraryService as never);
    const emitSpy = vi.fn();

    service.setEventSink(emitSpy);
    vi.spyOn(
      service as unknown as {
        resolveBackendCommand: () => Promise<{
          command: string;
          args: string[];
          cwd: string;
          env: NodeJS.ProcessEnv;
        }>;
      },
      "resolveBackendCommand",
    ).mockResolvedValue({
      command: "gui-api",
      args: [],
      cwd: "/tmp",
      env: process.env,
    });

    const conversion = service.convertPack(details.pack.id);
    await waitForSpawn();
    const payload = `${JSON.stringify(
      createEvent("asset-1", getExpectedStickerOutputPath(details, "asset-1")),
    )}\n`;
    child.stdout.emit("data", Buffer.from(payload.slice(0, 20)));
    child.stdout.emit("data", Buffer.from(payload.slice(20)));
    child.emit("close", 0);

    await conversion;

    expect(libraryService.recordConversionResult).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith(
      createEvent("asset-1", getExpectedStickerOutputPath(details, "asset-1")),
    );
  });

  it("rejects a completion event outside the pack output root", async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child as never);

    const details = createDetails();
    const libraryService = {
      getConversionContext: vi.fn(async () => details),
      getPack: vi.fn(async () => details),
      recordConversionResult: vi.fn(async () => undefined),
    };
    const service = new ConverterService(libraryService as never);

    vi.spyOn(
      service as unknown as {
        resolveBackendCommand: () => Promise<{
          command: string;
          args: string[];
          cwd: string;
          env: NodeJS.ProcessEnv;
        }>;
      },
      "resolveBackendCommand",
    ).mockResolvedValue({
      command: "gui-api",
      args: [],
      cwd: "/tmp",
      env: process.env,
    });

    const conversion = service.convertPack(details.pack.id);
    await waitForSpawn();
    child.stdout.emit(
      "data",
      Buffer.from(
        JSON.stringify(createEvent("asset-1", "/tmp/elsewhere/asset-1.webm")),
      ),
    );

    await expect(conversion).rejects.toThrow(
      `Conversion output path mismatch for pack ${details.pack.id}: asset asset-1 (sticker) reported ${path.resolve("/tmp/elsewhere/asset-1.webm")}, expected a file inside ${path.resolve(details.pack.outputRoot)}.`,
    );
    expect(libraryService.recordConversionResult).not.toHaveBeenCalled();
  });

  it("rejects a completion event with a non-canonical filename inside the output root", async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child as never);

    const details = createDetails();
    const libraryService = {
      getConversionContext: vi.fn(async () => details),
      getPack: vi.fn(async () => details),
      recordConversionResult: vi.fn(async () => undefined),
    };
    const service = new ConverterService(libraryService as never);

    vi.spyOn(
      service as unknown as {
        resolveBackendCommand: () => Promise<{
          command: string;
          args: string[];
          cwd: string;
          env: NodeJS.ProcessEnv;
        }>;
      },
      "resolveBackendCommand",
    ).mockResolvedValue({
      command: "gui-api",
      args: [],
      cwd: "/tmp",
      env: process.env,
    });

    const wrongOutputPath = path.join(details.pack.outputRoot, "stale-name.webm");
    const conversion = service.convertPack(details.pack.id);
    await waitForSpawn();
    child.stdout.emit(
      "data",
      Buffer.from(JSON.stringify(createEvent("asset-1", wrongOutputPath))),
    );

    await expect(conversion).rejects.toThrow(
      `Conversion output path mismatch for pack ${details.pack.id}: asset asset-1 (sticker) reported ${path.resolve(wrongOutputPath)}, expected ${path.resolve(getExpectedStickerOutputPath(details, "asset-1"))}.`,
    );
    expect(libraryService.recordConversionResult).not.toHaveBeenCalled();
  });

  it("builds conversion tasks from explicit asset order and appends the icon last", async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child as never);

    const details = createDetails();
    const libraryService = {
      getConversionContext: vi.fn(async () => details),
      getPack: vi.fn(async () => details),
      recordConversionResult: vi.fn(async () => undefined),
    };
    const service = new ConverterService(libraryService as never);

    vi.spyOn(
      service as unknown as {
        resolveBackendCommand: () => Promise<{
          command: string;
          args: string[];
          cwd: string;
          env: NodeJS.ProcessEnv;
        }>;
      },
      "resolveBackendCommand",
    ).mockResolvedValue({
      command: "gui-api",
      args: [],
      cwd: "/tmp",
      env: process.env,
    });

    const conversion = service.convertPack(details.pack.id);
    await waitForSpawn();
    const stdinEnd = child.stdin.end as unknown as { mock: { calls: unknown[][] } };
    const request = JSON.parse(
      String(stdinEnd.mock.calls[0]?.[0]),
    ) as { tasks: Array<{ assetId: string; mode: string }> };
    child.emit("close", 0);
    await conversion;

    expect(request.tasks).toEqual([
      { assetId: "asset-2", sourcePath: "/tmp/sample-pack/source/two.png", mode: "sticker" },
      { assetId: "asset-1", sourcePath: "/tmp/sample-pack/source/one.png", mode: "sticker" },
      { assetId: "asset-3", sourcePath: "/tmp/sample-pack/source/icon.png", mode: "icon" },
    ]);
  });

  it("falls back to system ffmpeg and ffprobe for packaged builds when bundled binaries are unhealthy", async () => {
    appMock.isPackaged = true;
    const { resourcesPath, backendDirectory } = await createBundledBackend();
    const systemBinDirectory = await fs.mkdtemp(
      path.join(process.cwd(), ".sticker-smith-system-bin-"),
    );
    tempDirectories.push(systemBinDirectory);
    await Promise.all([
      fs.writeFile(path.join(systemBinDirectory, "ffmpeg"), ""),
      fs.writeFile(path.join(systemBinDirectory, "ffprobe"), ""),
    ]);
    Object.defineProperty(process, "resourcesPath", {
      configurable: true,
      value: resourcesPath,
    });
    process.env.APPDIR = resourcesPath;
    process.env.PATH = [backendDirectory, systemBinDirectory].join(path.delimiter);
    delete process.env.STICKER_SMITH_FFMPEG;
    delete process.env.STICKER_SMITH_FFPROBE;

    spawnMock.mockImplementation((command: string, args?: string[]) => {
      if (args?.[0] === "-version") {
        if (
          command === path.join(backendDirectory, "ffmpeg") ||
          command === path.join(backendDirectory, "ffprobe")
        ) {
          return new FakeCommandProcess(127) as never;
        }

        if (
          command === path.join(systemBinDirectory, "ffmpeg") ||
          command === path.join(systemBinDirectory, "ffprobe")
        ) {
          return new FakeCommandProcess(0) as never;
        }

        return new FakeCommandProcess(127) as never;
      }

      throw new Error(`Unexpected spawn call: ${command} ${args?.join(" ")}`);
    });

    const service = new ConverterService({} as never);
    const backend = await getResolveBackendCommand(service);

    expect(backend.command).toBe(path.join(backendDirectory, "gui-api"));
    expect(backend.cwd).toBe(backendDirectory);
    expect(backend.env.STICKER_SMITH_FFMPEG).toBe(
      path.join(systemBinDirectory, "ffmpeg"),
    );
    expect(backend.env.STICKER_SMITH_FFPROBE).toBe(
      path.join(systemBinDirectory, "ffprobe"),
    );
  });

  it("uses bundled ffmpeg and ffprobe for packaged builds when both binaries are healthy", async () => {
    appMock.isPackaged = true;
    const { resourcesPath, backendDirectory } = await createBundledBackend();
    Object.defineProperty(process, "resourcesPath", {
      configurable: true,
      value: resourcesPath,
    });

    spawnMock.mockImplementation((command: string, args?: string[]) => {
      if (args?.[0] === "-version") {
        return new FakeCommandProcess(0) as never;
      }

      throw new Error(`Unexpected spawn call: ${command} ${args?.join(" ")}`);
    });

    const service = new ConverterService({} as never);
    const backend = await getResolveBackendCommand(service);

    expect(backend.command).toBe(path.join(backendDirectory, "gui-api"));
    expect(backend.env.STICKER_SMITH_FFMPEG).toBe(
      path.join(backendDirectory, "ffmpeg"),
    );
    expect(backend.env.STICKER_SMITH_FFPROBE).toBe(
      path.join(backendDirectory, "ffprobe"),
    );
  });

  it("prefers the workspace Python backend over dist/backend during development", async () => {
    const workspaceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "sticker-smith-workspace-"),
    );
    tempDirectories.push(workspaceRoot);
    await fs.mkdir(
      path.join(workspaceRoot, "tg-webm-converter", "dist", "backend"),
      { recursive: true },
    );
    await fs.mkdir(path.join(workspaceRoot, "tg-webm-converter", "src"), {
      recursive: true,
    });
    process.env.STICKER_SMITH_ROOT = workspaceRoot;
    delete process.env.STICKER_SMITH_BACKEND_DIR;
    delete process.env.PYTHONPATH;
    delete process.env.STICKER_SMITH_PYTHONPATH;

    const service = new ConverterService({} as never);
    const backend = await getResolveBackendCommand(service);

    expect(backend.command).toBe(process.platform === "win32" ? "python" : "python3");
    expect(backend.args).toEqual(["-m", "tg_webm_converter.gui_api"]);
    expect(backend.cwd).toBe(path.join(workspaceRoot, "tg-webm-converter"));
    expect(backend.env.PYTHONPATH).toBe(
      path.join(workspaceRoot, "tg-webm-converter", "src"),
    );
  });

  it("prepends the workspace source root to PYTHONPATH for the Python backend", async () => {
    const workspaceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "sticker-smith-pythonpath-"),
    );
    tempDirectories.push(workspaceRoot);
    await fs.mkdir(path.join(workspaceRoot, "tg-webm-converter", "src"), {
      recursive: true,
    });
    process.env.STICKER_SMITH_ROOT = workspaceRoot;
    process.env.STICKER_SMITH_PYTHONPATH = "/tmp/custom-a";
    process.env.PYTHONPATH = "/tmp/custom-b";

    const service = new ConverterService({} as never);
    const backend = await getResolveBackendCommand(service);

    expect(backend.env.PYTHONPATH).toBe(
      [
        path.join(workspaceRoot, "tg-webm-converter", "src"),
        "/tmp/custom-a",
        "/tmp/custom-b",
      ].join(path.delimiter),
    );
  });
});

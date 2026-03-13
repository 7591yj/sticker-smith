import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import type {
  ConversionJobEvent,
  ConversionJobRequest,
  ConversionTask,
  StickerPackDetails,
} from "@sticker-smith/shared";

import type { LibraryService } from "./libraryService";

const GUI_API_BINARY = process.platform === "win32" ? "gui-api.exe" : "gui-api";
const FFMPEG_BINARY = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
const FFPROBE_BINARY = process.platform === "win32" ? "ffprobe.exe" : "ffprobe";
const CURRENT_MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const COMMAND_HEALTH_CHECK_TIMEOUT_MS = 5_000;

function parseNdjsonLines(lines: string[]) {
  return lines
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as ConversionJobEvent);
}

function parseNdjsonChunk(buffer: string) {
  return parseNdjsonLines(buffer.split("\n"));
}

function consumeNdjsonChunk(buffer: string, chunk: Buffer) {
  const lines = `${buffer}${chunk.toString()}`.split("\n");
  return {
    buffer: lines.pop() ?? "",
    events: parseNdjsonLines(lines),
  };
}

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function commandIsHealthy(command: string, cwd?: string) {
  return await new Promise<boolean>((resolve) => {
    const child = spawn(command, ["-version"], {
      cwd,
      stdio: "ignore",
    });

    const timeout = setTimeout(() => {
      if (!child.killed) {
        child.kill();
      }
      resolve(false);
    }, COMMAND_HEALTH_CHECK_TIMEOUT_MS);

    child.once("error", () => {
      clearTimeout(timeout);
      resolve(false);
    });

    child.once("close", (code) => {
      clearTimeout(timeout);
      resolve(code === 0);
    });
  });
}

function isWithinDirectory(targetPath: string, directory: string) {
  const relativePath = path.relative(directory, targetPath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

async function resolveSystemCommand(
  commandName: string,
  excludedRoots: string[],
) {
  const pathEntries = process.env.PATH?.split(path.delimiter).filter(Boolean) ?? [];

  for (const entry of pathEntries) {
    const normalizedEntry = path.resolve(entry);
    if (excludedRoots.some((root) => isWithinDirectory(normalizedEntry, root))) {
      continue;
    }

    const candidate = path.join(normalizedEntry, commandName);
    if (!(await pathExists(candidate))) {
      continue;
    }

    if (await commandIsHealthy(candidate)) {
      return candidate;
    }
  }

  return commandName;
}

function joinPythonPathEntries(...entries: Array<string | undefined>) {
  const uniqueEntries: string[] = [];

  for (const entry of entries) {
    if (!entry) {
      continue;
    }

    for (const part of entry.split(path.delimiter).filter(Boolean)) {
      if (!uniqueEntries.includes(part)) {
        uniqueEntries.push(part);
      }
    }
  }

  return uniqueEntries.join(path.delimiter);
}

async function findWorkspaceRoot() {
  const explicitRoot = process.env.STICKER_SMITH_ROOT;
  if (
    explicitRoot &&
    (await pathExists(path.join(explicitRoot, "tg-webm-converter")))
  ) {
    return explicitRoot;
  }

  const startPoints = [process.cwd(), app.getAppPath(), CURRENT_MODULE_DIR];
  const visited = new Set<string>();

  for (const startPoint of startPoints) {
    let current = path.resolve(startPoint);

    while (!visited.has(current)) {
      visited.add(current);

      if (await pathExists(path.join(current, "tg-webm-converter"))) {
        return current;
      }

      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }

      current = parent;
    }
  }

  return null;
}

async function resolveBundledBackend(backendDirectory: string) {
  const command = path.join(backendDirectory, GUI_API_BINARY);
  const ffmpeg = path.join(backendDirectory, FFMPEG_BINARY);
  const ffprobe = path.join(backendDirectory, FFPROBE_BINARY);

  if (!(await pathExists(command))) {
    return null;
  }

  const bundledFfmpegAvailable =
    (await pathExists(ffmpeg)) && (await commandIsHealthy(ffmpeg, backendDirectory));
  const bundledFfprobeAvailable =
    (await pathExists(ffprobe)) &&
    (await commandIsHealthy(ffprobe, backendDirectory));

  if (!bundledFfmpegAvailable || !bundledFfprobeAvailable) {
    console.warn(
      "Bundled ffmpeg/ffprobe are unavailable; falling back to system commands.",
    );
  }

  const excludedRoots = new Set<string>([
    path.resolve(backendDirectory),
    path.resolve(process.resourcesPath),
    path.resolve(path.dirname(process.resourcesPath)),
  ]);

  if (process.env.APPDIR) {
    excludedRoots.add(path.resolve(process.env.APPDIR));
  }

  return {
    command,
    args: [] as string[],
    cwd: backendDirectory,
    env: {
      ...process.env,
      STICKER_SMITH_FFMPEG:
        bundledFfmpegAvailable
          ? ffmpeg
          : process.env.STICKER_SMITH_FFMPEG ??
            (await resolveSystemCommand(FFMPEG_BINARY, [...excludedRoots])),
      STICKER_SMITH_FFPROBE:
        bundledFfprobeAvailable
          ? ffprobe
          : process.env.STICKER_SMITH_FFPROBE ??
            (await resolveSystemCommand(FFPROBE_BINARY, [...excludedRoots])),
    },
  };
}

export class ConverterService {
  private eventSink: ((event: ConversionJobEvent) => void) | null = null;

  constructor(private readonly libraryService: LibraryService) {}

  setEventSink(eventSink: (event: ConversionJobEvent) => void) {
    this.eventSink = eventSink;
  }

  private emit(event: ConversionJobEvent) {
    this.eventSink?.(event);
  }

  private async handleJobEvent(packId: string, event: ConversionJobEvent) {
    this.emit(event);

    if (
      event.type === "asset_completed" &&
      event.assetId &&
      event.mode &&
      event.outputPath &&
      typeof event.sizeBytes === "number"
    ) {
      await this.libraryService.recordConversionResult(packId, {
        assetId: event.assetId,
        mode: event.mode,
        outputFileName: path.basename(event.outputPath),
        sizeBytes: event.sizeBytes,
      });
    }
  }

  private async handleQueuedJobEvents(
    packId: string,
    events: ConversionJobEvent[],
  ) {
    for (const event of events) {
      await this.handleJobEvent(packId, event);
    }
  }

  private async resolveBackendCommand() {
    const backendOverride = process.env.STICKER_SMITH_BACKEND_DIR;

    if (app.isPackaged) {
      const backendDirectory =
        backendOverride ?? path.join(process.resourcesPath, "backend");
      const bundledBackend = await resolveBundledBackend(backendDirectory);

      if (bundledBackend) {
        return bundledBackend;
      }

      throw new Error(
        `Bundled conversion backend not found at ${backendDirectory}`,
      );
    }

    const workspaceRoot = await findWorkspaceRoot();
    if (backendOverride) {
      const bundledBackend = await resolveBundledBackend(
        backendOverride,
      );
      if (bundledBackend) {
        return bundledBackend;
      }
    }

    if (!workspaceRoot) {
      throw new Error(
        "Could not locate the workspace root. Set STICKER_SMITH_ROOT or STICKER_SMITH_BACKEND_DIR.",
      );
    }

    // In development, prefer the live Python backend so source changes are used
    // immediately instead of a potentially stale bundled dist/backend.
    const pythonSourceRoot = path.join(workspaceRoot, "tg-webm-converter", "src");
    return {
      command:
        process.env.PYTHON ??
        (process.platform === "win32" ? "python" : "python3"),
      args: ["-m", "tg_webm_converter.gui_api"],
      cwd: path.join(workspaceRoot, "tg-webm-converter"),
      env: {
        ...process.env,
        PYTHONPATH:
          joinPythonPathEntries(
            pythonSourceRoot,
            process.env.STICKER_SMITH_PYTHONPATH,
            process.env.PYTHONPATH,
          ) || pythonSourceRoot,
      },
    };
  }

  private buildTasks(details: StickerPackDetails, assetIds?: string[]) {
    const selectedAssetIds = assetIds ? new Set(assetIds) : null;
    const tasks: ConversionTask[] = [];
    let iconTask: ConversionTask | null = null;

    for (const asset of details.assets) {
      if (selectedAssetIds && !selectedAssetIds.has(asset.id)) {
        continue;
      }
      if (!asset.absolutePath) {
        continue;
      }

      if (asset.id === details.pack.iconAssetId) {
        iconTask = {
          assetId: asset.id,
          sourcePath: asset.absolutePath,
          mode: "icon",
        };
        continue;
      }

      tasks.push({
        assetId: asset.id,
        sourcePath: asset.absolutePath,
        mode: "sticker",
      });
    }

    if (iconTask) {
      tasks.push(iconTask);
    }

    return tasks;
  }

  private async runJob(
    packId: string,
    outputRoot: string,
    tasks: ConversionTask[],
  ) {
    await fs.mkdir(outputRoot, { recursive: true });
    const jobId = randomUUID();
    const request: ConversionJobRequest = {
      jobId,
      outputRoot,
      tasks,
    };

    const backend = await this.resolveBackendCommand();

    await new Promise<void>((resolve, reject) => {
      const child = spawn(backend.command, backend.args, {
        cwd: backend.cwd,
        env: backend.env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdoutBuffer = "";
      let stderrBuffer = "";
      let eventQueue = Promise.resolve();
      let settled = false;

      const rejectOnce = (error: unknown) => {
        if (settled) {
          return;
        }

        settled = true;
        reject(error instanceof Error ? error : new Error(String(error)));
        if (!child.killed) {
          child.kill();
        }
      };

      const resolveOnce = () => {
        if (settled) {
          return;
        }

        settled = true;
        resolve();
      };

      const enqueueEvents = (events: ConversionJobEvent[]) => {
        if (events.length === 0 || settled) {
          return;
        }

        eventQueue = eventQueue.then(() =>
          this.handleQueuedJobEvents(packId, events),
        );
        eventQueue.catch(rejectOnce);
      };

      child.stdout.on("data", (chunk: Buffer) => {
        const parsed = consumeNdjsonChunk(stdoutBuffer, chunk);
        stdoutBuffer = parsed.buffer;
        enqueueEvents(parsed.events);
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderrBuffer += chunk.toString();
      });

      child.on("error", rejectOnce);
      child.on("close", (code) => {
        void (async () => {
          if (stdoutBuffer.trim()) {
            enqueueEvents(parseNdjsonChunk(stdoutBuffer));
            stdoutBuffer = "";
          }

          await eventQueue;
          if (settled) {
            return;
          }

          if (code === 0) {
            resolveOnce();
          } else {
            rejectOnce(
              new Error(stderrBuffer || `Backend exited with code ${code}`),
            );
          }
        })().catch(rejectOnce);
      });

      child.stdin.end(JSON.stringify(request));
    });
  }

  async convertPack(packId: string) {
    const details = await this.libraryService.getConversionContext(packId);
    await this.runJob(
      packId,
      details.pack.outputRoot,
      this.buildTasks(details),
    );
    return this.libraryService.getPack(packId);
  }

  async convertSelection(input: { packId: string; assetIds: string[] }) {
    const details = await this.libraryService.getConversionContext(
      input.packId,
    );
    await this.runJob(
      input.packId,
      details.pack.outputRoot,
      this.buildTasks(details, input.assetIds),
    );
    return this.libraryService.getPack(input.packId);
  }
}

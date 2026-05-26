import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  conversionJobEventSchema,
  type ConversionJobEvent,
  type ConversionJobRequest,
  type ConversionTask,
  type StickerPackDetails,
} from "@sticker-smith/shared";

import type { LibraryService } from "./libraryService";
import { isWithinDirectory, pathExists } from "../utils/fsUtils";
import {
  COMMAND_HEALTH_CHECK_TIMEOUT_MS,
  FFMPEG_BINARY,
  FFPROBE_BINARY,
  GUI_API_BINARY,
} from "../config/constants";
import { env } from "../config/env";

const CURRENT_MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

interface BackendCommand {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

interface NdjsonParseResult {
  buffer: string;
  events: ConversionJobEvent[];
}

function isStrictWebmStickerPath(outputPath: string, outputRoot: string): boolean {
  const relativePath = path.relative(outputRoot, outputPath);
  return (
    relativePath !== "" &&
    !relativePath.startsWith("..") &&
    !path.isAbsolute(relativePath) &&
    path.extname(outputPath).toLowerCase() === ".webm"
  );
}

class CanonicalStickerPathRegistry {
  private readonly outputPathByTaskKey: ReadonlyMap<string, string>;

  constructor(
    private readonly outputRoot: string,
    tasks: readonly ConversionTask[],
  ) {
    const resolvedOutputRoot = path.resolve(outputRoot);
    this.outputPathByTaskKey = new Map(
      tasks.map((task) => {
        const outputPath = path.resolve(task.outputPath);
        if (!isStrictWebmStickerPath(outputPath, resolvedOutputRoot)) {
          throw new Error(
            `Conversion task output path mismatch: sticker ${task.stickerId} (${task.mode}) requested ${outputPath}, expected a .webm file inside ${resolvedOutputRoot}.`,
          );
        }

        return [
          CanonicalStickerPathRegistry.getTaskKey(task.stickerId, task.mode),
          outputPath,
        ];
      }),
    );
  }

  static getTaskKey(stickerId: string, mode: ConversionTask["mode"]): string {
    return `${stickerId}:${mode}`;
  }

  validateCompletedEvent(
    packId: string,
    event: ConversionJobEvent & {
      type: "sticker_completed";
      stickerId: string;
      mode: ConversionTask["mode"];
      outputPath: string;
    },
  ): void {
    const actualPath = path.resolve(event.outputPath);
    const resolvedOutputRoot = path.resolve(this.outputRoot);

    if (!isStrictWebmStickerPath(actualPath, resolvedOutputRoot)) {
      throw new Error(
        `Conversion output path mismatch for pack ${packId}: sticker ${event.stickerId} (${event.mode}) reported ${actualPath}, expected a .webm file inside ${resolvedOutputRoot}.`,
      );
    }

    const expectedPath = this.outputPathByTaskKey.get(
      CanonicalStickerPathRegistry.getTaskKey(event.stickerId, event.mode),
    );

    if (!expectedPath) {
      throw new Error(
        `Conversion output path mismatch for pack ${packId}: sticker ${event.stickerId} (${event.mode}) reported ${actualPath}, but no canonical output path was registered for that task.`,
      );
    }

    if (actualPath !== expectedPath) {
      throw new Error(
        `Conversion output path mismatch for pack ${packId}: sticker ${event.stickerId} (${event.mode}) reported ${actualPath}, expected ${expectedPath}.`,
      );
    }
  }
}

function parseConversionJobEvent(line: string): ConversionJobEvent {
  return conversionJobEventSchema.parse(JSON.parse(line)) as ConversionJobEvent;
}

function parseNdjsonLines(lines: string[]): ConversionJobEvent[] {
  return lines.filter((line) => line.trim()).map(parseConversionJobEvent);
}

function parseNdjsonChunk(buffer: string): ConversionJobEvent[] {
  return parseNdjsonLines(buffer.split("\n"));
}

function flushStandaloneNdjsonValue(buffer: string): NdjsonParseResult | null {
  const trimmed = buffer.trim();
  if (!trimmed.includes("\n") && trimmed.length > 0) {
    try {
      return {
        buffer: "",
        events: [parseConversionJobEvent(trimmed)],
      };
    } catch {
      return null;
    }
  }

  return null;
}

function consumeNdjsonChunk(buffer: string, chunk: Buffer): NdjsonParseResult {
  const lines = `${buffer}${chunk.toString()}`.split("\n");
  const next = {
    buffer: lines.pop() ?? "",
    events: parseNdjsonLines(lines),
  };

  const flushed = flushStandaloneNdjsonValue(next.buffer);
  return flushed ?? next;
}

async function commandIsHealthy(command: string, cwd?: string): Promise<boolean> {
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

async function resolveSystemCommand(
  commandName: string,
  excludedRoots: string[],
): Promise<string> {
  const pathEntries = env.PATH?.split(path.delimiter).filter(Boolean) ?? [];

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

function joinPythonPathEntries(...entries: Array<string | undefined>): string {
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

async function findWorkspaceRoot(): Promise<string | null> {
  const explicitRoot = env.STICKER_SMITH_ROOT;
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

async function resolveBundledBackend(backendDirectory: string): Promise<BackendCommand | null> {
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

  if (env.APPDIR) {
    excludedRoots.add(path.resolve(env.APPDIR));
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
          : env.STICKER_SMITH_FFMPEG ??
            (await resolveSystemCommand(FFMPEG_BINARY, [...excludedRoots])),
      STICKER_SMITH_FFPROBE:
        bundledFfprobeAvailable
          ? ffprobe
          : env.STICKER_SMITH_FFPROBE ??
            (await resolveSystemCommand(FFPROBE_BINARY, [...excludedRoots])),
    },
  };
}

export class ConverterService {
  private eventSink: ((event: ConversionJobEvent) => void) | null = null;

  constructor(private readonly libraryService: LibraryService) {}

  setEventSink(eventSink: (event: ConversionJobEvent) => void): void {
    this.eventSink = eventSink;
  }

  private emit(event: ConversionJobEvent): void {
    this.eventSink?.(event);
  }

  private async recordCompletedEvent(
    packId: string,
    event: ConversionJobEvent & {
      type: "sticker_completed";
      stickerId: string;
      mode: ConversionTask["mode"];
      outputPath: string;
      sizeBytes: number;
    },
  ): Promise<void> {
    await this.libraryService.recordConversionResult(packId, {
      stickerId: event.stickerId,
      mode: event.mode,
      outputFileName: path.basename(event.outputPath),
      sizeBytes: event.sizeBytes,
    });
  }

  private async handleJobEvent(
    packId: string,
    stickerPathRegistry: CanonicalStickerPathRegistry,
    event: ConversionJobEvent,
  ): Promise<void> {
    this.emit(event);

    if (
      event.type === "sticker_completed" &&
      event.stickerId &&
      event.mode &&
      event.outputPath &&
      typeof event.sizeBytes === "number"
    ) {
      const completedEvent = event as ConversionJobEvent & {
        type: "sticker_completed";
        stickerId: string;
        mode: ConversionTask["mode"];
        outputPath: string;
        sizeBytes: number;
      };
      stickerPathRegistry.validateCompletedEvent(packId, completedEvent);
      await this.recordCompletedEvent(packId, completedEvent);
    }
  }

  private async handleQueuedJobEvents(
    packId: string,
    stickerPathRegistry: CanonicalStickerPathRegistry,
    events: ConversionJobEvent[],
  ): Promise<void> {
    for (const event of events) {
      await this.handleJobEvent(packId, stickerPathRegistry, event);
    }
  }

  private async resolvePackagedBackendCommand(
    backendOverride?: string,
  ): Promise<BackendCommand> {
    const backendDirectory =
      backendOverride ?? path.join(process.resourcesPath, "backend");
    const bundledBackend = await resolveBundledBackend(backendDirectory);

    if (bundledBackend) {
      return bundledBackend;
    }

    throw new Error(`Bundled conversion backend not found at ${backendDirectory}`);
  }

  private async resolveDevelopmentBackendCommand(
    workspaceRoot: string,
  ): Promise<BackendCommand> {
    const pythonSourceRoot = path.join(workspaceRoot, "tg-webm-converter", "src");
    return {
      command:
        env.PYTHON ??
        (process.platform === "win32" ? "python" : "python3"),
      args: ["-m", "tg_webm_converter.gui_api"],
      cwd: path.join(workspaceRoot, "tg-webm-converter"),
      env: {
        ...process.env,
        PYTHONPATH:
          joinPythonPathEntries(
            pythonSourceRoot,
            env.STICKER_SMITH_PYTHONPATH,
            process.env.PYTHONPATH,
          ) || pythonSourceRoot,
      },
    };
  }

  private async resolveBackendCommand(): Promise<BackendCommand> {
    const backendOverride = env.STICKER_SMITH_BACKEND_DIR;

    if (app.isPackaged) {
      return this.resolvePackagedBackendCommand(backendOverride);
    }

    if (backendOverride) {
      const bundledBackend = await resolveBundledBackend(backendOverride);
      if (bundledBackend) {
        return bundledBackend;
      }
    }

    const workspaceRoot = await findWorkspaceRoot();
    if (!workspaceRoot) {
      throw new Error(
        "Could not locate the workspace root. Set STICKER_SMITH_ROOT or STICKER_SMITH_BACKEND_DIR.",
      );
    }

    return this.resolveDevelopmentBackendCommand(workspaceRoot);
  }

  private buildTasks(details: StickerPackDetails, stickerIds?: string[]): ConversionTask[] {
    const selectedStickerIds = stickerIds ? new Set(stickerIds) : null;
    const sortedStickers = [...details.stickers].sort(
      (left, right) => left.order - right.order || left.id.localeCompare(right.id),
    );
    const outputRoot = path.join(details.pack.rootPath, "webm");
    const tasks: ConversionTask[] = [];
    let iconTask: ConversionTask | null = null;

    for (const sticker of sortedStickers) {
      if (selectedStickerIds && !selectedStickerIds.has(sticker.id)) {
        continue;
      }
      if (!sticker.absolutePath) {
        continue;
      }

      if (sticker.id === details.pack.iconStickerId) {
        iconTask = {
          stickerId: sticker.id,
          sourcePath: sticker.absolutePath,
          mode: "icon",
          outputPath: path.join(outputRoot, "icon.webm"),
        };
        continue;
      }

      tasks.push({
        stickerId: sticker.id,
        sourcePath: sticker.absolutePath,
        mode: "sticker",
        outputPath: path.join(outputRoot, `${sticker.id}.webm`),
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
  ): Promise<void> {
    await fs.mkdir(outputRoot, { recursive: true });
    const jobId = randomUUID();
    const request: ConversionJobRequest = {
      jobId,
      outputRoot,
      tasks,
    };
    const stickerPathRegistry = new CanonicalStickerPathRegistry(outputRoot, tasks);

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

      const rejectOnce = (error: unknown): void => {
        if (settled) {
          return;
        }

        settled = true;
        reject(error instanceof Error ? error : new Error(String(error)));
        if (!child.killed) {
          child.kill();
        }
      };

      const resolveOnce = (): void => {
        if (settled) {
          return;
        }

        settled = true;
        resolve();
      };

      const enqueueEvents = (events: ConversionJobEvent[]): void => {
        if (events.length === 0 || settled) {
          return;
        }

        eventQueue = eventQueue.then(() =>
          this.handleQueuedJobEvents(packId, stickerPathRegistry, events),
        );
        eventQueue.catch(rejectOnce);
      };

      child.stdout.on("data", (chunk: Buffer) => {
        try {
          const parsed = consumeNdjsonChunk(stdoutBuffer, chunk);
          stdoutBuffer = parsed.buffer;
          enqueueEvents(parsed.events);
        } catch (error) {
          rejectOnce(error);
        }
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

  async convert(input: { packId: string; stickerIds: string[] }): Promise<StickerPackDetails | null> {
    const details = await this.libraryService.getConversionContext(
      input.packId,
    );
    await this.runJob(
      input.packId,
      path.join(details.pack.rootPath, "webm"),
      this.buildTasks(details, input.stickerIds),
    );
    return this.libraryService.getPack(input.packId);
  }
}

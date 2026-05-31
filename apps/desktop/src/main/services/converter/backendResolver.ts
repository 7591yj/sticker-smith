import { app } from "electron";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMMAND_HEALTH_CHECK_TIMEOUT_MS,
  FFMPEG_BINARY,
  FFPROBE_BINARY,
  GUI_API_BINARY,
} from "../../config/constants";
import { env } from "../../config/env";
import { isWithinDirectory, pathExists } from "../../utils/fsUtils";
import type { BackendCommand } from "./types";

const CURRENT_MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

async function commandIsHealthy(
  command: string,
  cwd?: string,
): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const child = spawn(command, ["-version"], { cwd, stdio: "ignore" });
    const timeout = setTimeout(() => {
      if (!child.killed) child.kill();
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
    if (excludedRoots.some((root) => isWithinDirectory(normalizedEntry, root)))
      continue;

    const candidate = path.join(normalizedEntry, commandName);
    if (!(await pathExists(candidate))) continue;
    if (await commandIsHealthy(candidate)) return candidate;
  }

  return commandName;
}

function joinPythonPathEntries(...entries: Array<string | undefined>): string {
  const uniqueEntries: string[] = [];

  for (const entry of entries) {
    if (!entry) continue;
    for (const part of entry.split(path.delimiter).filter(Boolean)) {
      if (!uniqueEntries.includes(part)) uniqueEntries.push(part);
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
      if (await pathExists(path.join(current, "tg-webm-converter")))
        return current;

      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  return null;
}

async function bundledCommandIsAvailable(
  command: string,
  cwd: string,
): Promise<boolean> {
  return (await pathExists(command)) && (await commandIsHealthy(command, cwd));
}

function getBundledBackendExcludedRoots(backendDirectory: string): string[] {
  const excludedRoots = new Set<string>([
    path.resolve(backendDirectory),
    path.resolve(process.resourcesPath),
    path.resolve(path.dirname(process.resourcesPath)),
  ]);

  if (env.APPDIR) excludedRoots.add(path.resolve(env.APPDIR));
  return [...excludedRoots];
}

async function resolveBackendToolCommand(input: {
  bundledCommand: string;
  bundledAvailable: boolean;
  commandName: string;
  override?: string;
  excludedRoots: string[];
}): Promise<string> {
  if (input.bundledAvailable) return input.bundledCommand;
  return (
    input.override ??
    resolveSystemCommand(input.commandName, input.excludedRoots)
  );
}

async function resolveBundledBackend(
  backendDirectory: string,
): Promise<BackendCommand | null> {
  const command = path.join(backendDirectory, GUI_API_BINARY);
  const ffmpeg = path.join(backendDirectory, FFMPEG_BINARY);
  const ffprobe = path.join(backendDirectory, FFPROBE_BINARY);

  if (!(await pathExists(command))) return null;

  const bundledFfmpegAvailable = await bundledCommandIsAvailable(
    ffmpeg,
    backendDirectory,
  );
  const bundledFfprobeAvailable = await bundledCommandIsAvailable(
    ffprobe,
    backendDirectory,
  );

  if (!bundledFfmpegAvailable || !bundledFfprobeAvailable) {
    console.warn(
      "Bundled ffmpeg/ffprobe are unavailable; falling back to system commands.",
    );
  }

  const excludedRoots = getBundledBackendExcludedRoots(backendDirectory);

  return {
    command,
    args: [] as string[],
    cwd: backendDirectory,
    env: {
      ...process.env,
      STICKER_SMITH_FFMPEG: await resolveBackendToolCommand({
        bundledCommand: ffmpeg,
        bundledAvailable: bundledFfmpegAvailable,
        commandName: FFMPEG_BINARY,
        override: env.STICKER_SMITH_FFMPEG,
        excludedRoots,
      }),
      STICKER_SMITH_FFPROBE: await resolveBackendToolCommand({
        bundledCommand: ffprobe,
        bundledAvailable: bundledFfprobeAvailable,
        commandName: FFPROBE_BINARY,
        override: env.STICKER_SMITH_FFPROBE,
        excludedRoots,
      }),
    },
  };
}

async function resolvePackagedBackendCommand(
  backendOverride?: string,
): Promise<BackendCommand> {
  const backendDirectory =
    backendOverride ?? path.join(process.resourcesPath, "backend");
  const bundledBackend = await resolveBundledBackend(backendDirectory);
  if (bundledBackend) return bundledBackend;
  throw new Error(
    `Bundled conversion backend not found at ${backendDirectory}`,
  );
}

function resolveDevelopmentBackendCommand(
  workspaceRoot: string,
): BackendCommand {
  const pythonSourceRoot = path.join(workspaceRoot, "tg-webm-converter", "src");
  return {
    command:
      env.PYTHON ?? (process.platform === "win32" ? "python" : "python3"),
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

export async function resolveBackendCommand(): Promise<BackendCommand> {
  const backendOverride = env.STICKER_SMITH_BACKEND_DIR;

  if (app.isPackaged) return resolvePackagedBackendCommand(backendOverride);

  if (backendOverride) {
    const bundledBackend = await resolveBundledBackend(backendOverride);
    if (bundledBackend) return bundledBackend;
  }

  const workspaceRoot = await findWorkspaceRoot();
  if (!workspaceRoot) {
    throw new Error(
      "Could not locate the workspace root. Set STICKER_SMITH_ROOT or STICKER_SMITH_BACKEND_DIR.",
    );
  }

  return resolveDevelopmentBackendCommand(workspaceRoot);
}

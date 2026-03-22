import { shell } from "electron";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import type { LibraryService } from "./libraryService";
import { isWithinDirectory } from "../utils/fsUtils";

const execFileAsync = promisify(execFile);

async function commandExists(command: string) {
  try {
    await execFileAsync("sh", ["-c", `command -v ${command}`]);
    return true;
  } catch {
    return false;
  }
}

async function revealWithLinuxFileManager(
  targetPath: string,
  highlight: boolean,
) {
  const uri = pathToFileURL(targetPath).toString();
  const method = highlight ? "ShowItems" : "ShowFolders";

  if (await commandExists("dbus-send")) {
    await execFileAsync("dbus-send", [
      "--session",
      "--dest=org.freedesktop.FileManager1",
      "--type=method_call",
      "/org/freedesktop/FileManager1",
      `org.freedesktop.FileManager1.${method}`,
      `array:string:${uri}`,
      "string:",
    ]);
    return true;
  }

  if (await commandExists("gdbus")) {
    await execFileAsync("gdbus", [
      "call",
      "--session",
      "--dest",
      "org.freedesktop.FileManager1",
      "--object-path",
      "/org/freedesktop/FileManager1",
      "--method",
      `org.freedesktop.FileManager1.${method}`,
      `['${uri}']`,
      "",
    ]);
    return true;
  }

  return false;
}

export class ShellService {
  constructor(private readonly libraryService: LibraryService) {}

  private async revealFolder(folderPath: string) {
    await fs.mkdir(folderPath, { recursive: true });

    if (
      process.platform === "linux" &&
      (await revealWithLinuxFileManager(folderPath, false).catch(() => false))
    ) {
      return;
    }

    const openError = await shell.openPath(folderPath);
    if (openError) {
      throw new Error(openError);
    }
  }

  async revealOutput(input: { packId: string; relativePath?: string }) {
    const details = await this.libraryService.getPack(input.packId);
    if (input.relativePath) {
      const targetPath = path.join(details.pack.outputRoot, input.relativePath);
      await fs.access(targetPath);

      if (
        process.platform === "linux" &&
        (await revealWithLinuxFileManager(targetPath, true).catch(() => false))
      ) {
        return;
      }

      await shell.showItemInFolder(targetPath);
      return;
    }

    await this.revealFolder(details.pack.outputRoot);
  }

  async revealSourceFolder(input: { packId: string }) {
    const details = await this.libraryService.getPack(input.packId);
    await this.revealFolder(details.pack.sourceRoot);
  }

  async exportOutputFolder(input: {
    packId: string;
    destinationRoot: string;
  }) {
    const details = await this.libraryService.getPack(input.packId);
    const sourceRoot = path.resolve(details.pack.outputRoot);
    const destinationRoot = path.resolve(input.destinationRoot);
    const exportFolderName = `${details.pack.slug}-webm`;
    const targetRoot = path.resolve(
      path.join(destinationRoot, exportFolderName),
    );

    await fs.mkdir(sourceRoot, { recursive: true });

    if (targetRoot === sourceRoot) {
      throw new Error("Destination matches the outputs folder.");
    }

    if (isWithinDirectory(targetRoot, sourceRoot)) {
      throw new Error("Destination cannot be inside the outputs folder.");
    }

    await fs.cp(sourceRoot, targetRoot, {
      recursive: true,
      force: false,
      errorOnExist: true,
    });

    return targetRoot;
  }
}

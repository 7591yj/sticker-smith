import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { nowIso } from "../utils/timeUtils";

import type { LibraryConfig } from "@sticker-smith/shared";

function resolveDefaultLibraryRoot() {
  const home = os.homedir();

  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "StickerSmith");
  }

  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA ?? path.join(home, "AppData", "Roaming"),
      "StickerSmith",
    );
  }

  return path.join(home, ".local", "share", "StickerSmith");
}

export class SettingsService {
  private readonly root = resolveDefaultLibraryRoot();
  private readonly configPath = path.join(this.root, "config.json");

  async ensureLibrary() {
    await fs.mkdir(path.join(this.root, "packs"), { recursive: true });
    await this.getConfig();
  }

  getLibraryRoot() {
    return this.root;
  }

  async getConfig(): Promise<LibraryConfig> {
    await fs.mkdir(this.root, { recursive: true });

    try {
      const raw = await fs.readFile(this.configPath, "utf8");
      return JSON.parse(raw) as LibraryConfig;
    } catch {
      const config: LibraryConfig = {
        version: 1,
        libraryRoot: this.root,
        updatedAt: nowIso(),
      };
      await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
      return config;
    }
  }

  getPackRoot(packDirectoryName: string) {
    return path.join(this.root, "packs", packDirectoryName);
  }
}

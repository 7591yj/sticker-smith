import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { resolvePackagedTdjsonPath } from "../../src/main/services/telegramTdlibService";

export function registerPathTests() {
  it("rewrites packaged tdjson paths to app.asar.unpacked when present", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "sticker-smith-tdjson-"),
    );
    const unpackedPath = path.join(
      root,
      "resources",
      "app.asar.unpacked",
      "node_modules",
      "@prebuilt-tdlib",
      "linux-x64-glibc",
      "libtdjson.so",
    );
    await fs.mkdir(path.dirname(unpackedPath), { recursive: true });
    await fs.writeFile(unpackedPath, "");

    await expect(
      resolvePackagedTdjsonPath(
        path.join(
          root,
          "resources",
          "app.asar",
          "node_modules",
          "@prebuilt-tdlib",
          "linux-x64-glibc",
          "libtdjson.so",
        ),
      ),
    ).resolves.toBe(unpackedPath);

    await fs.rm(root, { recursive: true, force: true });
  });

  it("keeps packaged tdjson paths unchanged when no unpacked file exists", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "sticker-smith-tdjson-"),
    );
    const tdjsonPath = path.join(
      root,
      "resources",
      "app.asar",
      "node_modules",
      "@prebuilt-tdlib",
      "linux-x64-glibc",
      "libtdjson.so",
    );

    await expect(resolvePackagedTdjsonPath(tdjsonPath)).resolves.toBe(
      tdjsonPath,
    );

    await fs.rm(root, { recursive: true, force: true });
  });
}

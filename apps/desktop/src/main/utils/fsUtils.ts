import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export function isWithinDirectory(targetPath: string, directory: string) {
  const relativePath = path.relative(directory, targetPath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

export async function sha256ForFile(filePath: string): Promise<string | null> {
  try {
    const data = await fs.readFile(filePath);
    return createHash("sha256").update(data).digest("hex");
  } catch {
    return null;
  }
}

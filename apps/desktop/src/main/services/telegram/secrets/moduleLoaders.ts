import type { KeytarModule } from "./types";

function isKeytarModule(value: unknown): value is KeytarModule {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Partial<KeytarModule>).getPassword === "function" &&
    typeof (value as Partial<KeytarModule>).setPassword === "function" &&
    typeof (value as Partial<KeytarModule>).deletePassword === "function"
  );
}

export function normalizeKeytarModule(value: unknown): KeytarModule | null {
  if (isKeytarModule(value)) return value;

  if (
    typeof value === "object" &&
    value !== null &&
    "default" in value &&
    isKeytarModule((value as { default?: unknown }).default)
  ) {
    return (value as { default: KeytarModule }).default;
  }

  return null;
}

export async function loadKeytar() {
  return normalizeKeytarModule(await import("keytar"));
}

export async function loadSafeStorage() {
  const mod = await import("electron");
  return mod.safeStorage;
}

import fs from "node:fs/promises";
import path from "node:path";

let tdlibConfigured = false;

export async function resolvePackagedTdjsonPath(tdjson: string) {
  const normalizedTdjson = path.normalize(tdjson);
  const asarSegment = `${path.sep}app.asar${path.sep}`;

  if (!normalizedTdjson.includes(asarSegment)) {
    return normalizedTdjson;
  }

  const unpackedTdjson = normalizedTdjson.replace(
    asarSegment,
    `${path.sep}app.asar.unpacked${path.sep}`,
  );

  try {
    await fs.access(unpackedTdjson);
    return unpackedTdjson;
  } catch {
    return normalizedTdjson;
  }
}

export function configureTdlibOnce(
  configure: (options: {
    tdjson: string;
    verbosityLevel: number;
  }) => void,
  tdjson: string,
) {
  if (tdlibConfigured) {
    return;
  }

  configure({
    tdjson,
    verbosityLevel: 1,
  });
  tdlibConfigured = true;
}

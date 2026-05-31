import path from "node:path";
import type { ConversionJobEvent, ConversionTask } from "@sticker-smith/shared";

function isStrictWebmStickerPath(
  outputPath: string,
  outputRoot: string,
): boolean {
  const relativePath = path.relative(outputRoot, outputPath);
  return (
    relativePath !== "" &&
    !relativePath.startsWith("..") &&
    !path.isAbsolute(relativePath) &&
    path.extname(outputPath).toLowerCase() === ".webm"
  );
}

export class CanonicalStickerPathRegistry {
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

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  type ConversionJobEvent,
  type ConversionJobRequest,
  type ConversionTask,
  type StickerPackDetails,
} from "@sticker-smith/shared";

import type { LibraryService } from "../library/service";
import { runConversionBackendProcess } from "./backendProcess";
import { resolveBackendCommand } from "./backendResolver";
import { buildConversionTasks } from "./conversionTasks";
import { CanonicalStickerPathRegistry } from "./stickerPathRegistry";

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

  private async runJob(
    packId: string,
    outputRoot: string,
    tasks: ConversionTask[],
  ): Promise<void> {
    await fs.mkdir(outputRoot, { recursive: true });
    const request: ConversionJobRequest = {
      jobId: randomUUID(),
      outputRoot,
      tasks,
    };

    await runConversionBackendProcess({
      backend: await resolveBackendCommand(),
      request,
      packId,
      stickerPathRegistry: new CanonicalStickerPathRegistry(outputRoot, tasks),
      handleEvents: this.handleQueuedJobEvents.bind(this),
    });
  }

  async convert(input: {
    packId: string;
    stickerIds: string[];
  }): Promise<StickerPackDetails | null> {
    const details = await this.libraryService.getConversionContext(
      input.packId,
    );
    await this.runJob(
      input.packId,
      path.join(details.pack.rootPath, "webm"),
      buildConversionTasks(details, input.stickerIds),
    );
    return this.libraryService.getPack(input.packId);
  }
}

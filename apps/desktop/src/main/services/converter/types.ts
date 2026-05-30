import type {
  ConversionJobEvent,
  ConversionJobRequest,
} from "@sticker-smith/shared";
import type { CanonicalStickerPathRegistry } from "./stickerPathRegistry";

export interface BackendCommand {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export interface NdjsonParseResult {
  buffer: string;
  events: ConversionJobEvent[];
}

export interface ConversionProcessSettler {
  isSettled: () => boolean;
  resolveOnce: () => void;
  rejectOnce: (error: unknown) => void;
}

export interface ConversionEventQueue {
  enqueue: (events: ConversionJobEvent[]) => void;
  flush: () => Promise<void>;
}

export interface ConversionBackendProcessInput {
  backend: BackendCommand;
  request: ConversionJobRequest;
  packId: string;
  stickerPathRegistry: CanonicalStickerPathRegistry;
  handleEvents: (
    packId: string,
    stickerPathRegistry: CanonicalStickerPathRegistry,
    events: ConversionJobEvent[],
  ) => Promise<void>;
}

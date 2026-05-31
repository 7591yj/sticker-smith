import { spawn } from "node:child_process";
import {
  conversionJobEventSchema,
  type ConversionJobEvent,
} from "@sticker-smith/shared";
import type {
  ConversionBackendProcessInput,
  ConversionEventQueue,
  ConversionProcessSettler,
  NdjsonParseResult,
} from "./types";

function parseConversionJobEvent(line: string): ConversionJobEvent {
  return conversionJobEventSchema.parse(JSON.parse(line)) as ConversionJobEvent;
}

function parseNdjsonLines(lines: string[]): ConversionJobEvent[] {
  return lines.filter((line) => line.trim()).map(parseConversionJobEvent);
}

function parseNdjsonChunk(buffer: string): ConversionJobEvent[] {
  return parseNdjsonLines(buffer.split("\n"));
}

function flushStandaloneNdjsonValue(buffer: string): NdjsonParseResult | null {
  const trimmed = buffer.trim();
  if (!trimmed.includes("\n") && trimmed.length > 0) {
    try {
      return { buffer: "", events: [parseConversionJobEvent(trimmed)] };
    } catch {
      return null;
    }
  }

  return null;
}

function consumeNdjsonChunk(buffer: string, chunk: Buffer): NdjsonParseResult {
  const lines = `${buffer}${chunk.toString()}`.split("\n");
  const next = { buffer: lines.pop() ?? "", events: parseNdjsonLines(lines) };
  return flushStandaloneNdjsonValue(next.buffer) ?? next;
}

function createConversionEventQueue(
  input: Pick<
    ConversionBackendProcessInput,
    "packId" | "stickerPathRegistry" | "handleEvents"
  >,
  settler: Pick<ConversionProcessSettler, "isSettled" | "rejectOnce">,
): ConversionEventQueue {
  let eventQueue = Promise.resolve();

  return {
    enqueue(events: ConversionJobEvent[]): void {
      if (events.length === 0 || settler.isSettled()) return;

      eventQueue = eventQueue.then(() =>
        input.handleEvents(input.packId, input.stickerPathRegistry, events),
      );
      eventQueue.catch(settler.rejectOnce);
    },
    flush: () => eventQueue,
  };
}

function finishConversionBackendProcess(
  code: number | null,
  stderrBuffer: string,
  settler: ConversionProcessSettler,
): void {
  if (settler.isSettled()) return;
  if (code === 0) {
    settler.resolveOnce();
    return;
  }

  settler.rejectOnce(
    new Error(stderrBuffer || `Backend exited with code ${code}`),
  );
}

async function flushConversionStdout(
  stdoutBuffer: string,
  queue: ConversionEventQueue,
): Promise<string> {
  if (stdoutBuffer.trim()) {
    queue.enqueue(parseNdjsonChunk(stdoutBuffer));
    return "";
  }

  return stdoutBuffer;
}

export async function runConversionBackendProcess(
  input: ConversionBackendProcessInput,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(input.backend.command, input.backend.args, {
      cwd: input.backend.cwd,
      env: input.backend.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdoutBuffer = "";
    let stderrBuffer = "";
    let settled = false;

    const settler: ConversionProcessSettler = {
      isSettled: () => settled,
      resolveOnce: () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      },
      rejectOnce: (error: unknown) => {
        if (settled) return;

        settled = true;
        reject(error instanceof Error ? error : new Error(String(error)));
        if (!child.killed) child.kill();
      },
    };
    const queue = createConversionEventQueue(input, settler);

    child.stdout.on("data", (chunk: Buffer) => {
      try {
        const parsed = consumeNdjsonChunk(stdoutBuffer, chunk);
        stdoutBuffer = parsed.buffer;
        queue.enqueue(parsed.events);
      } catch (error) {
        settler.rejectOnce(error);
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
    });

    child.on("error", settler.rejectOnce);
    child.on("close", (code) => {
      void (async () => {
        stdoutBuffer = await flushConversionStdout(stdoutBuffer, queue);
        await queue.flush();
        finishConversionBackendProcess(code, stderrBuffer, settler);
      })().catch(settler.rejectOnce);
    });

    child.stdin.end(JSON.stringify(input.request));
  });
}

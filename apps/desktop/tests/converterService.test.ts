import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ConversionJobEvent,
  StickerPackDetails,
} from "@sticker-smith/shared";

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getAppPath: () => "/tmp/sticker-smith",
  },
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
  default: {
    spawn: spawnMock,
  },
}));

import { ConverterService } from "../src/main/services/converterService";

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = { end: vi.fn() };
  killed = false;

  kill = vi.fn(() => {
    this.killed = true;
    return true;
  });
}

async function waitForSpawn() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (spawnMock.mock.calls.length > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error("spawn was not called");
}

function createDetails(): StickerPackDetails {
  return {
    pack: {
      id: "pack-1",
      name: "Sample Pack",
      slug: "sample-pack",
      rootPath: "/tmp/sample-pack",
      sourceRoot: "/tmp/sample-pack/source",
      outputRoot: "/tmp/sample-pack/webm",
      iconAssetId: "asset-3",
      thumbnailPath: null,
      createdAt: "2026-03-11T00:00:00.000Z",
      updatedAt: "2026-03-11T00:00:00.000Z",
    },
    assets: [
      {
        id: "asset-1",
        packId: "pack-1",
        relativePath: "one.png",
        absolutePath: "/tmp/sample-pack/source/one.png",
        kind: "png",
        importedAt: "2026-03-11T00:00:00.000Z",
        originalImportPath: "/tmp/imports/one.png",
      },
      {
        id: "asset-2",
        packId: "pack-1",
        relativePath: "two.png",
        absolutePath: "/tmp/sample-pack/source/two.png",
        kind: "png",
        importedAt: "2026-03-11T00:00:00.000Z",
        originalImportPath: "/tmp/imports/two.png",
      },
      {
        id: "asset-3",
        packId: "pack-1",
        relativePath: "icon.png",
        absolutePath: "/tmp/sample-pack/source/icon.png",
        kind: "png",
        importedAt: "2026-03-11T00:00:00.000Z",
        originalImportPath: "/tmp/imports/icon.png",
      },
    ],
    outputs: [],
  };
}

function createEvent(assetId: string, outputPath: string): ConversionJobEvent {
  return {
    type: "asset_completed",
    jobId: "job-1",
    assetId,
    mode: "sticker",
    outputPath,
    sizeBytes: 128,
  };
}

afterEach(() => {
  spawnMock.mockReset();
  vi.restoreAllMocks();
});

describe("ConverterService", () => {
  it("records buffered completion events before the job resolves", async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child as never);

    const details = createDetails();
    const libraryService = {
      getConversionContext: vi.fn(async () => details),
      getPack: vi.fn(async () => details),
      recordConversionResult: vi.fn(async () => undefined),
    };
    const service = new ConverterService(libraryService as never);
    const emitSpy = vi.fn();

    service.setEventSink(emitSpy);
    vi.spyOn(
      service as unknown as {
        resolveBackendCommand: () => Promise<{
          command: string;
          args: string[];
          cwd: string;
          env: NodeJS.ProcessEnv;
        }>;
      },
      "resolveBackendCommand",
    ).mockResolvedValue({
      command: "gui-api",
      args: [],
      cwd: "/tmp",
      env: process.env,
    });

    const conversion = service.convertPack(details.pack.id);
    await waitForSpawn();
    child.stdout.emit(
      "data",
      Buffer.from(JSON.stringify(createEvent("asset-1", "/tmp/out/one.webm"))),
    );
    child.emit("close", 0);

    await conversion;

    expect(libraryService.recordConversionResult).toHaveBeenCalledWith(
      details.pack.id,
      {
        assetId: "asset-1",
        mode: "sticker",
        outputFileName: "one.webm",
        sizeBytes: 128,
      },
    );
    expect(emitSpy).toHaveBeenCalledWith(
      createEvent("asset-1", "/tmp/out/one.webm"),
    );
  });

  it("serializes completion writes emitted in separate stdout chunks", async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child as never);

    const details = createDetails();
    let releaseFirstWrite = () => undefined;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const callOrder: string[] = [];

    const libraryService = {
      getConversionContext: vi.fn(async () => details),
      getPack: vi.fn(async () => details),
      recordConversionResult: vi.fn(
        async (_packId: string, result: { assetId: string }) => {
          callOrder.push(`start:${result.assetId}`);
          if (result.assetId === "asset-1") {
            await firstWrite;
          }
          callOrder.push(`end:${result.assetId}`);
        },
      ),
    };
    const service = new ConverterService(libraryService as never);

    vi.spyOn(
      service as unknown as {
        resolveBackendCommand: () => Promise<{
          command: string;
          args: string[];
          cwd: string;
          env: NodeJS.ProcessEnv;
        }>;
      },
      "resolveBackendCommand",
    ).mockResolvedValue({
      command: "gui-api",
      args: [],
      cwd: "/tmp",
      env: process.env,
    });

    const conversion = service.convertPack(details.pack.id);
    await waitForSpawn();
    child.stdout.emit(
      "data",
      Buffer.from(
        `${JSON.stringify(createEvent("asset-1", "/tmp/out/one.webm"))}\n`,
      ),
    );
    child.stdout.emit(
      "data",
      Buffer.from(
        `${JSON.stringify(createEvent("asset-2", "/tmp/out/two.webm"))}\n`,
      ),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(callOrder).toEqual(["start:asset-1"]);

    releaseFirstWrite();
    child.emit("close", 0);

    await conversion;

    expect(callOrder).toEqual([
      "start:asset-1",
      "end:asset-1",
      "start:asset-2",
      "end:asset-2",
    ]);
  });
});

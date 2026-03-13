import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ConversionJobEvent,
  StickerPack,
  StickerPackDetails,
  TelegramEvent,
  TelegramState,
} from "@sticker-smith/shared";
import { App } from "../src/renderer/App";
import { useDesktopAppState } from "../src/renderer/hooks/useDesktopAppState";

function createDisconnectedTelegramState(): TelegramState {
  return {
    backend: "tdlib",
    status: "disconnected",
    authStep: "wait_tdlib_parameters",
    selectedMode: "user",
    recommendedMode: "user",
    message:
      "Enter your Telegram api_id and api_hash to start a user session and sync owned sticker packs.",
    tdlib: {
      apiId: null,
      apiHashConfigured: false,
    },
    user: {
      phoneNumber: null,
    },
    sessionUser: null,
    lastError: null,
    updatedAt: "2026-03-12T00:00:00.000Z",
  };
}

function createPack(overrides: Partial<StickerPack> = {}): StickerPack {
  return {
    id: "pack-1",
    source: "local",
    name: "Cats",
    slug: "cats",
    rootPath: "/tmp/cats",
    sourceRoot: "/tmp/cats/source",
    outputRoot: "/tmp/cats/webm",
    iconAssetId: null,
    thumbnailPath: null,
    createdAt: "2026-03-12T00:00:00.000Z",
    updatedAt: "2026-03-12T00:00:00.000Z",
    ...overrides,
  };
}

function createDetails(overrides: Partial<StickerPackDetails> = {}): StickerPackDetails {
  return {
    pack: createPack(),
    assets: [
      {
        id: "asset-1",
        packId: "pack-1",
        relativePath: "nested/cat.png",
        absolutePath: "/tmp/cats/source/nested/cat.png",
        emojiList: [],
        kind: "png",
        importedAt: "2026-03-12T00:00:00.000Z",
        originalImportPath: null,
        downloadState: "ready",
      },
      {
        id: "asset-2",
        packId: "pack-1",
        relativePath: "dog.png",
        absolutePath: "/tmp/cats/source/dog.png",
        emojiList: [],
        kind: "png",
        importedAt: "2026-03-12T00:00:00.000Z",
        originalImportPath: null,
        downloadState: "ready",
      },
    ],
    outputs: [],
    ...overrides,
  };
}

function createBridge(options: {
  packs?: StickerPack[];
  details?: StickerPackDetails;
  onConversionSubscribe?: (listener: (event: ConversionJobEvent) => void) => void;
  onTelegramSubscribe?: (listener: (event: TelegramEvent) => void) => void;
}) {
  const packs = options.packs ?? [createPack()];
  const details = options.details ?? createDetails();

  return {
    telegram: {
      getState: vi.fn(async () => createDisconnectedTelegramState()),
      subscribe: vi.fn((listener: (event: TelegramEvent) => void) => {
        options.onTelegramSubscribe?.(listener);
        return () => undefined;
      }),
      submitTdlibParameters: vi.fn(),
      submitPhoneNumber: vi.fn(),
      submitCode: vi.fn(),
      submitPassword: vi.fn(),
      logout: vi.fn(),
      reset: vi.fn(),
      syncOwnedPacks: vi.fn(async () => undefined),
      publishLocalPack: vi.fn(async () => undefined),
      updateTelegramPack: vi.fn(async () => undefined),
      downloadPackMedia: vi.fn(async () => undefined),
    },
    packs: {
      list: vi.fn(async () => packs),
      get: vi.fn(async () => details),
      create: vi.fn(),
      createFromDirectory: vi.fn(),
      rename: vi.fn(),
      delete: vi.fn(),
      setIcon: vi.fn(),
      revealSourceFolder: vi.fn(),
    },
    assets: {
      importFiles: vi.fn(),
      importDirectory: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      rename: vi.fn(),
      renameMany: vi.fn(),
      setEmojis: vi.fn(),
      setEmojisMany: vi.fn(),
    },
    conversion: {
      subscribe: vi.fn((listener: (event: ConversionJobEvent) => void) => {
        options.onConversionSubscribe?.(listener);
        return () => undefined;
      }),
      convertPack: vi.fn(async () => details),
    },
    outputs: {
      revealInFolder: vi.fn(),
      exportFolder: vi.fn(),
    },
    settings: {},
  };
}

function HookHarness() {
  const { conversionEvents, converting, failureDialog } = useDesktopAppState();

  return (
    <div
      data-converting={String(converting)}
      data-event-count={String(conversionEvents.length)}
      data-failure-count={String(failureDialog?.failureCount ?? 0)}
    >
      {failureDialog?.failures[0]?.error ?? ""}
    </div>
  );
}

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("desktop app state", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("tracks conversion state, truncates event history, and builds fallback failures", async () => {
    let conversionListener: ((event: ConversionJobEvent) => void) | null = null;

    Object.assign(window, {
      stickerSmith: createBridge({
        onConversionSubscribe: (listener) => {
          conversionListener = listener;
        },
      }),
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<HookHarness />);
      await flushEffects();
    });

    await act(async () => {
      conversionListener?.({
        type: "job_started",
        jobId: "job-1",
        taskCount: 2,
      });
      for (let index = 0; index < 55; index += 1) {
        conversionListener?.({
          type: "asset_started",
          jobId: "job-1",
          assetId: `asset-${index}`,
          mode: "sticker",
        });
      }
      conversionListener?.({
        type: "job_finished",
        jobId: "job-1",
        successCount: 1,
        failureCount: 1,
      });
      await flushEffects();
    });

    expect(container.firstElementChild?.getAttribute("data-converting")).toBe(
      "false",
    );
    expect(container.firstElementChild?.getAttribute("data-event-count")).toBe(
      "50",
    );
    expect(container.firstElementChild?.getAttribute("data-failure-count")).toBe(
      "1",
    );
    expect(container.textContent).toContain(
      "One or more assets failed while the conversion ran in the background.",
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("shows conversion progress and a failure dialog with leaf asset names", async () => {
    let conversionListener: ((event: ConversionJobEvent) => void) | null = null;

    Object.assign(window, {
      stickerSmith: createBridge({
        onConversionSubscribe: (listener) => {
          conversionListener = listener;
        },
      }),
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<App />);
      await flushEffects();
    });

    await act(async () => {
      conversionListener?.({
        type: "job_started",
        jobId: "job-2",
        taskCount: 2,
      });
      await flushEffects();
    });

    expect(document.body.textContent).toContain("Converting 2 assets");

    await act(async () => {
      conversionListener?.({
        type: "asset_failed",
        jobId: "job-2",
        assetId: "asset-1",
        mode: "sticker",
        error: "ffmpeg crashed",
      });
      conversionListener?.({
        type: "job_finished",
        jobId: "job-2",
        successCount: 1,
        failureCount: 1,
      });
      await flushEffects();
    });

    expect(document.body.textContent).toContain("Conversion failed");
    expect(document.body.textContent).toContain(
      'Sticker Smith finished converting "Cats" in the background, but 1 asset failed.',
    );
    expect(document.body.textContent).toContain("cat.png");
    expect(document.body.textContent).toContain("ffmpeg crashed");

    await act(async () => {
      root.unmount();
    });
  });
});

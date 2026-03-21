import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const registeredHandlers = new Map<string, (...args: unknown[]) => unknown>();
  const handleMock = vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
    registeredHandlers.set(channel, handler);
  });
  const sendPrimary = vi.fn();
  const sendSecondary = vi.fn();
  const getAllWindowsMock = vi.fn(() => [
    { webContents: { send: sendPrimary } },
    { webContents: { send: sendSecondary } },
  ]);
  const fromWebContentsMock = vi.fn(() => undefined);
  const showOpenDialogMock = vi.fn(async () => ({ filePaths: [] }));

  const settingsService = {
    getConfig: vi.fn(async () => ({ libraryRoot: "/tmp/library" })),
  };
  const libraryService = {
    listPacks: vi.fn(async () => []),
    getPack: vi.fn(),
    createPack: vi.fn(),
    importDirectory: vi.fn(),
    renamePack: vi.fn(),
    deletePack: vi.fn(),
    setPackTelegramShortName: vi.fn(),
    setPackIcon: vi.fn(),
    importFiles: vi.fn(),
    renameAsset: vi.fn(),
    renameManyAssets: vi.fn(),
    setAssetEmojis: vi.fn(),
    setManyAssetEmojis: vi.fn(),
    reorderAsset: vi.fn(),
    moveAsset: vi.fn(),
    deleteAsset: vi.fn(),
    deleteManyAssets: vi.fn(),
    listOutputs: vi.fn(),
  };
  const shellService = {
    revealSourceFolder: vi.fn(),
    revealOutput: vi.fn(),
    exportOutputFolder: vi.fn(),
  };
  const converterService = {
    setEventSink: vi.fn(),
    convertPack: vi.fn(),
    convertSelection: vi.fn(),
  };
  const telegramService = {
    subscribe: vi.fn(),
    getState: vi.fn(),
    submitTdlibParameters: vi.fn(),
    submitPhoneNumber: vi.fn(),
    submitCode: vi.fn(),
    submitPassword: vi.fn(),
    logout: vi.fn(),
    reset: vi.fn(),
    syncOwnedPacks: vi.fn(),
    downloadPackMedia: vi.fn(),
    publishLocalPack: vi.fn(),
    updateTelegramPack: vi.fn(),
  };

  return {
    registeredHandlers,
    handleMock,
    sendPrimary,
    sendSecondary,
    getAllWindowsMock,
    fromWebContentsMock,
    showOpenDialogMock,
    settingsService,
    libraryService,
    shellService,
    converterService,
    telegramService,
  };
});

vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: hoisted.getAllWindowsMock,
    fromWebContents: hoisted.fromWebContentsMock,
  },
  dialog: {
    showOpenDialog: hoisted.showOpenDialogMock,
  },
  ipcMain: {
    handle: hoisted.handleMock,
  },
}));

vi.mock("../src/main/services/settingsService", () => ({
  SettingsService: vi.fn().mockImplementation(() => hoisted.settingsService),
}));

vi.mock("../src/main/services/libraryService", () => ({
  LibraryService: vi.fn().mockImplementation(() => hoisted.libraryService),
}));

vi.mock("../src/main/services/shellService", () => ({
  ShellService: vi.fn().mockImplementation(() => hoisted.shellService),
}));

vi.mock("../src/main/services/converterService", () => ({
  ConverterService: vi.fn().mockImplementation(() => hoisted.converterService),
}));

vi.mock("../src/main/services/telegramService", () => ({
  TelegramService: vi.fn().mockImplementation(() => hoisted.telegramService),
}));

import { createBroadcastEmitter } from "../src/main/ipc/eventBus";
import { registerIpc } from "../src/main/ipc";

describe("ipc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.registeredHandlers.clear();
    hoisted.settingsService.getConfig.mockResolvedValue({
      libraryRoot: "/tmp/library",
    });
  });

  it("broadcasts events to every open window", () => {
    const payload = { type: "job_started", jobId: "job-1" };

    createBroadcastEmitter("conversion.event")(payload);

    expect(hoisted.sendPrimary).toHaveBeenCalledWith("conversion.event", payload);
    expect(hoisted.sendSecondary).toHaveBeenCalledWith(
      "conversion.event",
      payload,
    );
  });

  it("wraps ipc handlers with logging and rethrow semantics", async () => {
    const error = new Error("settings exploded");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    hoisted.settingsService.getConfig.mockRejectedValue(error);

    registerIpc();

    expect(hoisted.converterService.setEventSink).toHaveBeenCalledTimes(1);
    expect(hoisted.telegramService.subscribe).toHaveBeenCalledTimes(1);

    const handler = hoisted.registeredHandlers.get("settings.getConfig");
    expect(handler).toBeTypeOf("function");

    await expect(
      handler?.({ sender: {} } as never),
    ).rejects.toBe(error);
    expect(hoisted.settingsService.getConfig).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith("[ipc] settings.getConfig:", error);
  });
});

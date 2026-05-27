import { BrowserWindow, dialog, ipcMain } from "electron";
import type { IpcMainInvokeEvent, OpenDialogOptions } from "electron";
import path from "node:path";

import {
  convertSchema,
  createPackSchema,
  deleteStickerSchema,
  deleteManyStickersSchema,
  deletePackSchema,
  downloadTelegramPackMediaSchema,
  exportStickerFolderSchema,
  importDirectorySchema,
  importFilesSchema,
  listStickersSchema,
  moveStickerSchema,
  publishLocalPackSchema,
  reorderStickerSchema,
  renameStickerSchema,
  renameManyStickersSchema,
  renamePackSchema,
  revealStickerSchema,
  setStickerEmojisSchema,
  setPackTelegramShortNameSchema,
  setManyStickerEmojisSchema,
  submitTelegramCodeSchema,
  submitTelegramPasswordSchema,
  setTelegramPhoneNumberSchema,
  setTelegramTdlibParametersSchema,
  setPackIconSchema,
  updateTelegramPackSchema,
} from "@sticker-smith/shared";
import { mainProcessDialogStrings } from "./config/windowConfig";
import { createBroadcastEmitter } from "./ipc/eventBus";
import { ConverterService } from "./services/converterService";
import { LibraryService } from "./services/libraryService";
import { SettingsService } from "./services/settingsService";
import { ShellService } from "./services/shellService";
import { TelegramService } from "./services/telegramService";

const settingsService = new SettingsService();
const libraryService = new LibraryService(settingsService);
const shellService = new ShellService(libraryService);
const converterService = new ConverterService(libraryService);
const telegramService = new TelegramService(settingsService, libraryService);

const emitConversionEvent = createBroadcastEmitter("conversion.event");
const emitTelegramEvent = createBroadcastEmitter("telegram.event");

function safeHandle<TArgs extends unknown[], TResult>(
  channel: string,
  handler: (
    event: IpcMainInvokeEvent,
    ...args: TArgs
  ) => TResult | Promise<TResult>,
) {
  ipcMain.handle(channel, async (event, ...args: TArgs) => {
    try {
      return await handler(event, ...args);
    } catch (error) {
      console.error(`[ipc] ${channel}:`, error);
      throw error;
    }
  });
}

async function createPackFromDirectory() {
  const directoryPath = (
    await dialog.showOpenDialog({
      properties: ["openDirectory"],
    })
  ).filePaths[0];

  if (!directoryPath) {
    return null;
  }

  const pack = await libraryService.createPack({
    name: path.basename(directoryPath),
  });
  await libraryService.importDirectory(pack.id, directoryPath);
  return libraryService.getPack(pack.id);
}

async function choosePackIcon(input: unknown) {
  const payload = listStickersSchema.parse(input);
  const selected = await dialog.showOpenDialog({
    properties: ["openFile"],
  });
  const filePath = selected.filePaths[0];
  if (!filePath) {
    return null;
  }

  const imported = await libraryService.importFiles(payload.packId, [filePath]);
  const asset = imported.imported[0];
  if (!asset) {
    throw new Error("Selected file could not be imported as an icon.");
  }

  await libraryService.setPackIcon({
    packId: payload.packId,
    stickerId: asset.id,
  });
  return converterService.convert({
    packId: payload.packId,
    stickerIds: [asset.id],
  });
}

async function importStickerFiles(input: unknown) {
  const payload = importFilesSchema.parse(input);
  const filePaths =
    payload.filePaths ??
    (
      await dialog.showOpenDialog({
        properties: ["openFile", "multiSelections"],
      })
    ).filePaths;

  return libraryService.importFiles(payload.packId, filePaths);
}

async function importStickerDirectory(input: unknown) {
  const payload = importDirectorySchema.parse(input);
  const directoryPath =
    payload.directoryPath ??
    (
      await dialog.showOpenDialog({
        properties: ["openDirectory"],
      })
    ).filePaths[0];

  return directoryPath
    ? libraryService.importDirectory(payload.packId, directoryPath)
    : { imported: [], skipped: [] };
}

async function exportStickerFolder(event: IpcMainInvokeEvent, input: unknown) {
  const payload = exportStickerFolderSchema.parse(input);
  const ownerWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const dialogOptions: OpenDialogOptions = {
    title: mainProcessDialogStrings.exportDialogTitle,
    buttonLabel: mainProcessDialogStrings.exportFolderButtonLabel,
    properties: ["openDirectory"],
  };
  const destinationRoot = (
    ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)
  ).filePaths[0];

  if (!destinationRoot) {
    return null;
  }

  return shellService.exportStickerFolder({
    packId: payload.packId,
    destinationRoot,
  });
}

function registerTelegramIpc() {
  safeHandle("telegram.getState", async () => telegramService.getState());
  safeHandle("telegram.submitTdlibParameters", async (_event, input: unknown) =>
    telegramService.submitTdlibParameters(
      setTelegramTdlibParametersSchema.parse(input),
    ),
  );
  safeHandle("telegram.submitPhoneNumber", async (_event, input: unknown) =>
    telegramService.submitPhoneNumber(
      setTelegramPhoneNumberSchema.parse(input),
    ),
  );
  safeHandle("telegram.submitCode", async (_event, input: unknown) =>
    telegramService.submitCode(submitTelegramCodeSchema.parse(input)),
  );
  safeHandle("telegram.submitPassword", async (_event, input: unknown) =>
    telegramService.submitPassword(submitTelegramPasswordSchema.parse(input)),
  );
  safeHandle("telegram.logout", async () => telegramService.logout());
  safeHandle("telegram.reset", async () => telegramService.reset());
  safeHandle("telegram.syncOwnedPacks", async () =>
    telegramService.syncOwnedPacks(),
  );
  safeHandle("telegram.downloadPackMedia", async (_event, input: unknown) =>
    telegramService.downloadPackMedia(
      downloadTelegramPackMediaSchema.parse(input),
    ),
  );
  safeHandle("telegram.publishLocalPack", async (_event, input: unknown) =>
    telegramService.publishLocalPack(publishLocalPackSchema.parse(input)),
  );
  safeHandle("telegram.updateTelegramPack", async (_event, input: unknown) =>
    telegramService.updateTelegramPack(updateTelegramPackSchema.parse(input)),
  );
}

function registerPackIpc() {
  safeHandle("packs.list", async () => libraryService.listPacks());
  safeHandle("packs.get", async (_event, input: { packId: string }) =>
    libraryService.getPack(input.packId),
  );
  safeHandle("packs.create", async (_event, input: unknown) =>
    libraryService.createPack(createPackSchema.parse(input)),
  );
  safeHandle("packs.createFromDirectory", createPackFromDirectory);
  safeHandle("packs.rename", async (_event, input: unknown) =>
    libraryService.renamePack(renamePackSchema.parse(input)),
  );
  safeHandle("packs.delete", async (_event, input: unknown) =>
    libraryService.deletePack(deletePackSchema.parse(input)),
  );
  safeHandle("packs.setTelegramShortName", async (_event, input: unknown) =>
    libraryService.setPackTelegramShortName(
      setPackTelegramShortNameSchema.parse(input),
    ),
  );
  safeHandle("packs.setIcon", async (_event, input: unknown) =>
    libraryService.setPackIcon(setPackIconSchema.parse(input)),
  );
  safeHandle("packs.chooseIcon", async (_event, input: unknown) =>
    choosePackIcon(input),
  );
}

function registerStickerIpc() {
  safeHandle("stickers.importFiles", async (_event, input: unknown) =>
    importStickerFiles(input),
  );
  safeHandle("stickers.importDirectory", async (_event, input: unknown) =>
    importStickerDirectory(input),
  );
  safeHandle("stickers.rename", async (_event, input: unknown) =>
    libraryService.renameSticker(renameStickerSchema.parse(input)),
  );
  safeHandle("stickers.renameMany", async (_event, input: unknown) =>
    libraryService.renameManyStickers(renameManyStickersSchema.parse(input)),
  );
  safeHandle("stickers.setEmojis", async (_event, input: unknown) =>
    libraryService.setStickerEmojis(setStickerEmojisSchema.parse(input)),
  );
  safeHandle("stickers.setEmojisMany", async (_event, input: unknown) =>
    libraryService.setManyStickerEmojis(setManyStickerEmojisSchema.parse(input)),
  );
  safeHandle("stickers.reorder", async (_event, input: unknown) =>
    libraryService.reorderSticker(reorderStickerSchema.parse(input)),
  );
  safeHandle("stickers.move", async (_event, input: unknown) =>
    libraryService.moveSticker(moveStickerSchema.parse(input)),
  );
  safeHandle("stickers.delete", async (_event, input: unknown) =>
    libraryService.deleteSticker(deleteStickerSchema.parse(input)),
  );
  safeHandle("stickers.deleteMany", async (_event, input: unknown) =>
    libraryService.deleteManyStickers(deleteManyStickersSchema.parse(input)),
  );
  safeHandle("stickers.revealInFolder", async (_event, input: unknown) =>
    shellService.revealSticker(revealStickerSchema.parse(input)),
  );
  safeHandle("stickers.exportFolder", exportStickerFolder);
}

export function registerIpc() {
  converterService.setEventSink(emitConversionEvent);
  telegramService.subscribe(emitTelegramEvent);

  safeHandle("settings.getConfig", async () => settingsService.getConfig());
  registerTelegramIpc();
  registerPackIpc();
  registerStickerIpc();
  safeHandle("conversion.convert", async (_event, input: unknown) =>
    converterService.convert(convertSchema.parse(input)),
  );
}

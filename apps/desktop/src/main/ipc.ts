import { BrowserWindow, dialog, ipcMain } from "electron";
import type { IpcMainInvokeEvent, OpenDialogOptions } from "electron";
import path from "node:path";

import {
  convertSelectionSchema,
  createPackSchema,
  deleteAssetSchema,
  deleteManyAssetsSchema,
  deletePackSchema,
  downloadTelegramPackMediaSchema,
  exportOutputFolderSchema,
  importDirectorySchema,
  importFilesSchema,
  listOutputsSchema,
  moveAssetSchema,
  publishLocalPackSchema,
  reorderAssetSchema,
  renameAssetSchema,
  renameManyAssetsSchema,
  renamePackSchema,
  revealPackSourceFolderSchema,
  revealOutputSchema,
  setAssetEmojisSchema,
  setPackTelegramShortNameSchema,
  setManyAssetEmojisSchema,
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

export function registerIpc() {
  converterService.setEventSink(emitConversionEvent);
  telegramService.subscribe(emitTelegramEvent);

  safeHandle("settings.getConfig", async () => settingsService.getConfig());
  safeHandle("telegram.getState", async () => telegramService.getState());
  safeHandle(
    "telegram.submitTdlibParameters",
    async (_event, input: unknown) =>
      telegramService.submitTdlibParameters(
        setTelegramTdlibParametersSchema.parse(input),
      ),
  );
  safeHandle("telegram.submitPhoneNumber", async (_event, input: unknown) =>
    telegramService.submitPhoneNumber(setTelegramPhoneNumberSchema.parse(input)),
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

  safeHandle("packs.list", async () => libraryService.listPacks());
  safeHandle("packs.get", async (_event, input: { packId: string }) =>
    libraryService.getPack(input.packId),
  );
  safeHandle("packs.create", async (_event, input: unknown) =>
    libraryService.createPack(createPackSchema.parse(input)),
  );
  safeHandle("packs.createFromDirectory", async () => {
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
  });
  safeHandle("packs.rename", async (_event, input: unknown) =>
    libraryService.renamePack(renamePackSchema.parse(input)),
  );
  safeHandle("packs.delete", async (_event, input: unknown) =>
    libraryService.deletePack(deletePackSchema.parse(input)),
  );
  safeHandle("packs.revealSourceFolder", async (_event, input: unknown) =>
    shellService.revealSourceFolder(revealPackSourceFolderSchema.parse(input)),
  );
  safeHandle("packs.setTelegramShortName", async (_event, input: unknown) =>
    libraryService.setPackTelegramShortName(
      setPackTelegramShortNameSchema.parse(input),
    ),
  );
  safeHandle("packs.setIcon", async (_event, input: unknown) =>
    libraryService.setPackIcon(setPackIconSchema.parse(input)),
  );

  safeHandle("assets.importFiles", async (_event, input: unknown) => {
    const payload = importFilesSchema.parse(input);
    const filePaths =
      payload.filePaths ??
      (
        await dialog.showOpenDialog({
          properties: ["openFile", "multiSelections"],
        })
      ).filePaths;

    return libraryService.importFiles(payload.packId, filePaths);
  });

  safeHandle("assets.importDirectory", async (_event, input: unknown) => {
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
  });

  safeHandle("assets.rename", async (_event, input: unknown) =>
    libraryService.renameAsset(renameAssetSchema.parse(input)),
  );
  safeHandle("assets.renameMany", async (_event, input: unknown) =>
    libraryService.renameManyAssets(renameManyAssetsSchema.parse(input)),
  );
  safeHandle("assets.setEmojis", async (_event, input: unknown) =>
    libraryService.setAssetEmojis(setAssetEmojisSchema.parse(input)),
  );
  safeHandle("assets.setEmojisMany", async (_event, input: unknown) =>
    libraryService.setManyAssetEmojis(setManyAssetEmojisSchema.parse(input)),
  );
  safeHandle("assets.reorder", async (_event, input: unknown) =>
    libraryService.reorderAsset(reorderAssetSchema.parse(input)),
  );
  safeHandle("assets.move", async (_event, input: unknown) =>
    libraryService.moveAsset(moveAssetSchema.parse(input)),
  );
  safeHandle("assets.delete", async (_event, input: unknown) =>
    libraryService.deleteAsset(deleteAssetSchema.parse(input)),
  );
  safeHandle("assets.deleteMany", async (_event, input: unknown) =>
    libraryService.deleteManyAssets(deleteManyAssetsSchema.parse(input)),
  );

  safeHandle("outputs.list", async (_event, input: unknown) =>
    libraryService.listOutputs(listOutputsSchema.parse(input).packId),
  );
  safeHandle("outputs.revealInFolder", async (_event, input: unknown) =>
    shellService.revealOutput(revealOutputSchema.parse(input)),
  );
  safeHandle("outputs.exportFolder", async (event, input: unknown) => {
    const payload = exportOutputFolderSchema.parse(input);
    const ownerWindow =
      BrowserWindow.fromWebContents(event.sender) ?? undefined;
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

    return shellService.exportOutputFolder({
      packId: payload.packId,
      destinationRoot,
    });
  });

  safeHandle(
    "conversion.convertPack",
    async (_event, input: { packId: string }) =>
      converterService.convertPack(input.packId),
  );
  safeHandle(
    "conversion.convertSelection",
    async (_event, input: unknown) =>
      converterService.convertSelection(convertSelectionSchema.parse(input)),
  );
}

import { BrowserWindow, dialog, ipcMain } from "electron";
import type { OpenDialogOptions } from "electron";
import path from "node:path";

import {
  convertSelectionSchema,
  createPackSchema,
  deleteAssetSchema,
  deletePackSchema,
  downloadTelegramPackMediaSchema,
  exportOutputFolderSchema,
  importDirectorySchema,
  importFilesSchema,
  listOutputsSchema,
  moveAssetSchema,
  publishLocalPackSchema,
  renameAssetSchema,
  renamePackSchema,
  revealOutputSchema,
  setAssetEmojisSchema,
  submitTelegramCodeSchema,
  submitTelegramPasswordSchema,
  setTelegramPhoneNumberSchema,
  setTelegramTdlibParametersSchema,
  setPackIconSchema,
  updateTelegramPackSchema,
} from "@sticker-smith/shared";
import { appTokens } from "../theme/appTokens";

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

function emitConversionEvent(payload: unknown) {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("conversion.event", payload);
  }
}

function emitTelegramEvent(payload: unknown) {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("telegram.event", payload);
  }
}

export function registerIpc() {
  converterService.setEventSink(emitConversionEvent);
  telegramService.subscribe(emitTelegramEvent);

  ipcMain.handle("settings.getConfig", async () => settingsService.getConfig());
  ipcMain.handle("telegram.getState", async () => telegramService.getState());
  ipcMain.handle(
    "telegram.submitTdlibParameters",
    async (_event, input: unknown) =>
      telegramService.submitTdlibParameters(
        setTelegramTdlibParametersSchema.parse(input),
      ),
  );
  ipcMain.handle("telegram.submitPhoneNumber", async (_event, input: unknown) =>
    telegramService.submitPhoneNumber(setTelegramPhoneNumberSchema.parse(input)),
  );
  ipcMain.handle("telegram.submitCode", async (_event, input: unknown) =>
    telegramService.submitCode(submitTelegramCodeSchema.parse(input)),
  );
  ipcMain.handle("telegram.submitPassword", async (_event, input: unknown) =>
    telegramService.submitPassword(submitTelegramPasswordSchema.parse(input)),
  );
  ipcMain.handle("telegram.logout", async () => telegramService.logout());
  ipcMain.handle("telegram.reset", async () => telegramService.reset());
  ipcMain.handle("telegram.syncOwnedPacks", async () =>
    telegramService.syncOwnedPacks(),
  );
  ipcMain.handle("telegram.downloadPackMedia", async (_event, input: unknown) =>
    telegramService.downloadPackMedia(
      downloadTelegramPackMediaSchema.parse(input),
    ),
  );
  ipcMain.handle("telegram.publishLocalPack", async (_event, input: unknown) =>
    telegramService.publishLocalPack(publishLocalPackSchema.parse(input)),
  );
  ipcMain.handle("telegram.updateTelegramPack", async (_event, input: unknown) =>
    telegramService.updateTelegramPack(updateTelegramPackSchema.parse(input)),
  );

  ipcMain.handle("packs.list", async () => libraryService.listPacks());
  ipcMain.handle("packs.get", async (_event, input: { packId: string }) =>
    libraryService.getPack(input.packId),
  );
  ipcMain.handle("packs.create", async (_event, input: unknown) =>
    libraryService.createPack(createPackSchema.parse(input)),
  );
  ipcMain.handle("packs.createFromDirectory", async () => {
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
  ipcMain.handle("packs.rename", async (_event, input: unknown) =>
    libraryService.renamePack(renamePackSchema.parse(input)),
  );
  ipcMain.handle("packs.delete", async (_event, input: unknown) =>
    libraryService.deletePack(deletePackSchema.parse(input)),
  );
  ipcMain.handle("packs.setIcon", async (_event, input: unknown) =>
    libraryService.setPackIcon(setPackIconSchema.parse(input)),
  );

  ipcMain.handle("assets.importFiles", async (_event, input: unknown) => {
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

  ipcMain.handle("assets.importDirectory", async (_event, input: unknown) => {
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

  ipcMain.handle("assets.rename", async (_event, input: unknown) =>
    libraryService.renameAsset(renameAssetSchema.parse(input)),
  );
  ipcMain.handle("assets.setEmojis", async (_event, input: unknown) =>
    libraryService.setAssetEmojis(setAssetEmojisSchema.parse(input)),
  );
  ipcMain.handle("assets.move", async (_event, input: unknown) =>
    libraryService.moveAsset(moveAssetSchema.parse(input)),
  );
  ipcMain.handle("assets.delete", async (_event, input: unknown) =>
    libraryService.deleteAsset(deleteAssetSchema.parse(input)),
  );

  ipcMain.handle("outputs.list", async (_event, input: unknown) =>
    libraryService.listOutputs(listOutputsSchema.parse(input).packId),
  );
  ipcMain.handle("outputs.revealInFolder", async (_event, input: unknown) =>
    shellService.revealOutput(revealOutputSchema.parse(input)),
  );
  ipcMain.handle("outputs.exportFolder", async (event, input: unknown) => {
    const payload = exportOutputFolderSchema.parse(input);
    const ownerWindow =
      BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const dialogOptions: OpenDialogOptions = {
      title: appTokens.copy.labels.exportDialogTitle,
      buttonLabel: appTokens.copy.actions.copyFolderHere,
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

  ipcMain.handle(
    "conversion.convertPack",
    async (_event, input: { packId: string }) =>
      converterService.convertPack(input.packId),
  );
  ipcMain.handle(
    "conversion.convertSelection",
    async (_event, input: unknown) =>
      converterService.convertSelection(convertSelectionSchema.parse(input)),
  );
}

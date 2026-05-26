import { contextBridge, ipcRenderer } from "electron";

import type {
  ConversionJobEvent,
  ConvertInput,
  DeleteStickerInput,
  DeleteManyStickersInput,
  ImportResult,
  MoveStickerInput,
  PublishLocalPackInput,
  ReorderStickerInput,
  RenameStickerInput,
  RenameManyStickersInput,
  SetPackTelegramShortNameInput,
  SetTelegramPhoneNumberInput,
  SetTelegramTdlibParametersInput,
  SetStickerEmojisInput,
  SetManyStickerEmojisInput,
  StickerSmithApi,
  StickerPack,
  StickerPackDetails,
  SubmitTelegramCodeInput,
  SubmitTelegramPasswordInput,
  TelegramEvent,
  TelegramState,
  UpdateTelegramPackInput,
} from "@sticker-smith/shared";

const stickerSmith: StickerSmithApi = {
  settings: {
    getConfig: () => ipcRenderer.invoke("settings.getConfig"),
  },
  telegram: {
    getState: (): Promise<TelegramState> =>
      ipcRenderer.invoke("telegram.getState"),
    submitTdlibParameters: (
      input: SetTelegramTdlibParametersInput,
    ): Promise<TelegramState> =>
      ipcRenderer.invoke("telegram.submitTdlibParameters", input),
    submitPhoneNumber: (
      input: SetTelegramPhoneNumberInput,
    ): Promise<TelegramState> =>
      ipcRenderer.invoke("telegram.submitPhoneNumber", input),
    submitCode: (input: SubmitTelegramCodeInput): Promise<TelegramState> =>
      ipcRenderer.invoke("telegram.submitCode", input),
    submitPassword: (
      input: SubmitTelegramPasswordInput,
    ): Promise<TelegramState> =>
      ipcRenderer.invoke("telegram.submitPassword", input),
    logout: (): Promise<TelegramState> => ipcRenderer.invoke("telegram.logout"),
    reset: (): Promise<TelegramState> => ipcRenderer.invoke("telegram.reset"),
    syncOwnedPacks: (): Promise<void> =>
      ipcRenderer.invoke("telegram.syncOwnedPacks"),
    downloadPackMedia: (input: { packId: string }): Promise<void> =>
      ipcRenderer.invoke("telegram.downloadPackMedia", input),
    publishLocalPack: (input: PublishLocalPackInput): Promise<void> =>
      ipcRenderer.invoke("telegram.publishLocalPack", input),
    updateTelegramPack: (input: UpdateTelegramPackInput): Promise<void> =>
      ipcRenderer.invoke("telegram.updateTelegramPack", input),
    subscribe: (listener: (event: TelegramEvent) => void) => {
      const wrapped = (_event: unknown, payload: TelegramEvent) => {
        listener(payload);
      };

      ipcRenderer.on("telegram.event", wrapped);
      return () => {
        ipcRenderer.off("telegram.event", wrapped);
      };
    },
  },
  packs: {
    list: (): Promise<StickerPack[]> => ipcRenderer.invoke("packs.list"),
    create: (input: { name: string }): Promise<StickerPack> =>
      ipcRenderer.invoke("packs.create", input),
    createFromDirectory: (): Promise<StickerPackDetails | null> =>
      ipcRenderer.invoke("packs.createFromDirectory"),
    rename: (input: { packId: string; name: string }): Promise<StickerPack> =>
      ipcRenderer.invoke("packs.rename", input),
    delete: (input: { packId: string }): Promise<void> =>
      ipcRenderer.invoke("packs.delete", input),
    get: (packId: string): Promise<StickerPackDetails> =>
      ipcRenderer.invoke("packs.get", { packId }),
    setTelegramShortName: (
      input: SetPackTelegramShortNameInput,
    ): Promise<StickerPack> =>
      ipcRenderer.invoke("packs.setTelegramShortName", input),
    setIcon: (input: {
      packId: string;
      stickerId: string | null;
    }): Promise<StickerPack> => ipcRenderer.invoke("packs.setIcon", input),
    chooseIcon: (input: {
      packId: string;
    }): Promise<StickerPackDetails | null> =>
      ipcRenderer.invoke("packs.chooseIcon", input),
  },
  stickers: {
    importFiles: (input: {
      packId: string;
      filePaths?: string[];
    }): Promise<ImportResult> =>
      ipcRenderer.invoke("stickers.importFiles", input),
    importDirectory: (input: {
      packId: string;
      directoryPath?: string;
    }): Promise<ImportResult> =>
      ipcRenderer.invoke("stickers.importDirectory", input),
    setEmojis: (input: SetStickerEmojisInput): Promise<StickerPackDetails> =>
      ipcRenderer.invoke("stickers.setEmojis", input),
    setEmojisMany: (
      input: SetManyStickerEmojisInput,
    ): Promise<StickerPackDetails> =>
      ipcRenderer.invoke("stickers.setEmojisMany", input),
    reorder: (input: ReorderStickerInput): Promise<StickerPackDetails> =>
      ipcRenderer.invoke("stickers.reorder", input),
    rename: (input: RenameStickerInput): Promise<StickerPackDetails> =>
      ipcRenderer.invoke("stickers.rename", input),
    renameMany: (input: RenameManyStickersInput): Promise<StickerPackDetails> =>
      ipcRenderer.invoke("stickers.renameMany", input),
    move: (input: MoveStickerInput): Promise<StickerPackDetails> =>
      ipcRenderer.invoke("stickers.move", input),
    delete: (input: DeleteStickerInput): Promise<StickerPackDetails> =>
      ipcRenderer.invoke("stickers.delete", input),
    deleteMany: (input: DeleteManyStickersInput): Promise<StickerPackDetails> =>
      ipcRenderer.invoke("stickers.deleteMany", input),
    revealInFolder: (input: { packId: string; relativePath?: string }) =>
      ipcRenderer.invoke("stickers.revealInFolder", input),
    exportFolder: (input: { packId: string }) =>
      ipcRenderer.invoke("stickers.exportFolder", input),
  },
  conversion: {
    convert: (input: ConvertInput) =>
      ipcRenderer.invoke("conversion.convert", input),
    subscribe: (listener: (event: ConversionJobEvent) => void) => {
      const wrapped = (_event: unknown, payload: ConversionJobEvent) => {
        listener(payload);
      };

      ipcRenderer.on("conversion.event", wrapped);
      return () => {
        ipcRenderer.off("conversion.event", wrapped);
      };
    },
  },
};

contextBridge.exposeInMainWorld("stickerSmith", stickerSmith);

declare global {
  interface Window {
    stickerSmith: StickerSmithApi;
  }
}

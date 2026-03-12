import { contextBridge, ipcRenderer } from "electron";

import type {
  ConversionJobEvent,
  ConvertSelectionInput,
  DeleteAssetInput,
  ImportResult,
  MoveAssetInput,
  PublishLocalPackInput,
  RenameAssetInput,
  SetTelegramPhoneNumberInput,
  SetTelegramTdlibParametersInput,
  SetAssetEmojisInput,
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
    getState: (): Promise<TelegramState> => ipcRenderer.invoke("telegram.getState"),
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
    syncOwnedPacks: (): Promise<void> => ipcRenderer.invoke("telegram.syncOwnedPacks"),
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
    setIcon: (input: {
      packId: string;
      assetId: string | null;
    }): Promise<StickerPack> => ipcRenderer.invoke("packs.setIcon", input),
  },
  assets: {
    importFiles: (input: {
      packId: string;
      filePaths?: string[];
    }): Promise<ImportResult> =>
      ipcRenderer.invoke("assets.importFiles", input),
    importDirectory: (input: {
      packId: string;
      directoryPath?: string;
    }): Promise<ImportResult> =>
      ipcRenderer.invoke("assets.importDirectory", input),
    setEmojis: (input: SetAssetEmojisInput): Promise<StickerPackDetails> =>
      ipcRenderer.invoke("assets.setEmojis", input),
    rename: (input: RenameAssetInput): Promise<StickerPackDetails> =>
      ipcRenderer.invoke("assets.rename", input),
    move: (input: MoveAssetInput): Promise<StickerPackDetails> =>
      ipcRenderer.invoke("assets.move", input),
    delete: (input: DeleteAssetInput): Promise<StickerPackDetails> =>
      ipcRenderer.invoke("assets.delete", input),
  },
  outputs: {
    list: (packId: string) => ipcRenderer.invoke("outputs.list", { packId }),
    revealInFolder: (input: { packId: string; relativePath?: string }) =>
      ipcRenderer.invoke("outputs.revealInFolder", input),
    exportFolder: (input: { packId: string }) =>
      ipcRenderer.invoke("outputs.exportFolder", input),
  },
  conversion: {
    convertPack: (input: { packId: string }) =>
      ipcRenderer.invoke("conversion.convertPack", input),
    convertSelection: (input: ConvertSelectionInput) =>
      ipcRenderer.invoke("conversion.convertSelection", input),
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

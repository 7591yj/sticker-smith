import { contextBridge, ipcRenderer } from "electron";

import type {
  ConversionJobEvent,
  ConvertSelectionInput,
  DeleteAssetInput,
  ImportResult,
  MoveAssetInput,
  RenameAssetInput,
  StickerSmithApi,
  StickerPack,
  StickerPackDetails,
} from "@sticker-smith/shared";

const stickerSmith: StickerSmithApi = {
  settings: {
    getConfig: () => ipcRenderer.invoke("settings.getConfig"),
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

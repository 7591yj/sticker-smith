import type {
  ConversionJobEvent,
  ConvertSelectionInput,
  DeleteAssetInput,
  ImportResult,
  LibraryConfig,
  MoveAssetInput,
  OutputArtifact,
  RenameAssetInput,
  SetAssetEmojisInput,
  TelegramAuthMode,
  TelegramState,
  StickerPack,
  StickerPackDetails,
} from "./types";

export interface StickerSmithApi {
  settings: {
    getConfig: () => Promise<LibraryConfig>;
  };
  telegram: {
    getState: () => Promise<TelegramState>;
    selectAuthMode: (input: {
      mode: TelegramAuthMode;
    }) => Promise<TelegramState>;
    disconnect: () => Promise<TelegramState>;
  };
  packs: {
    list: () => Promise<StickerPack[]>;
    create: (input: { name: string }) => Promise<StickerPack>;
    createFromDirectory: () => Promise<StickerPackDetails | null>;
    rename: (input: { packId: string; name: string }) => Promise<StickerPack>;
    delete: (input: { packId: string }) => Promise<void>;
    get: (packId: string) => Promise<StickerPackDetails>;
    setIcon: (input: {
      packId: string;
      assetId: string | null;
    }) => Promise<StickerPack>;
  };
  assets: {
    importFiles: (input: {
      packId: string;
      filePaths?: string[];
    }) => Promise<ImportResult>;
    importDirectory: (input: {
      packId: string;
      directoryPath?: string;
    }) => Promise<ImportResult>;
    setEmojis: (input: SetAssetEmojisInput) => Promise<StickerPackDetails>;
    rename: (input: RenameAssetInput) => Promise<StickerPackDetails>;
    move: (input: MoveAssetInput) => Promise<StickerPackDetails>;
    delete: (input: DeleteAssetInput) => Promise<StickerPackDetails>;
  };
  outputs: {
    list: (packId: string) => Promise<OutputArtifact[]>;
    revealInFolder: (input: {
      packId: string;
      relativePath?: string;
    }) => Promise<void>;
    exportFolder: (input: { packId: string }) => Promise<string | null>;
  };
  conversion: {
    convertPack: (input: { packId: string }) => Promise<StickerPackDetails>;
    convertSelection: (
      input: ConvertSelectionInput,
    ) => Promise<StickerPackDetails>;
    subscribe: (listener: (event: ConversionJobEvent) => void) => () => void;
  };
}

import type {
  ConversionJobEvent,
  ConvertSelectionInput,
  DeleteAssetInput,
  DeleteManyAssetsInput,
  ImportResult,
  LibraryConfig,
  MoveAssetInput,
  OutputArtifact,
  PublishLocalPackInput,
  ReorderAssetInput,
  RenameAssetInput,
  RenameManyAssetsInput,
  SetTelegramPhoneNumberInput,
  SetPackTelegramShortNameInput,
  SetTelegramTdlibParametersInput,
  SetAssetEmojisInput,
  SetManyAssetEmojisInput,
  StickerPack,
  StickerPackDetails,
  SubmitTelegramCodeInput,
  SubmitTelegramPasswordInput,
  TelegramEvent,
  TelegramState,
  UpdateTelegramPackInput,
} from "./types";

export interface StickerSmithApi {
  settings: {
    getConfig: () => Promise<LibraryConfig>;
  };
  telegram: {
    getState: () => Promise<TelegramState>;
    submitTdlibParameters: (
      input: SetTelegramTdlibParametersInput,
    ) => Promise<TelegramState>;
    submitPhoneNumber: (
      input: SetTelegramPhoneNumberInput,
    ) => Promise<TelegramState>;
    submitCode: (input: SubmitTelegramCodeInput) => Promise<TelegramState>;
    submitPassword: (
      input: SubmitTelegramPasswordInput,
    ) => Promise<TelegramState>;
    logout: () => Promise<TelegramState>;
    reset: () => Promise<TelegramState>;
    syncOwnedPacks: () => Promise<void>;
    downloadPackMedia: (input: { packId: string }) => Promise<void>;
    publishLocalPack: (input: PublishLocalPackInput) => Promise<void>;
    updateTelegramPack: (input: UpdateTelegramPackInput) => Promise<void>;
    subscribe: (listener: (event: TelegramEvent) => void) => () => void;
  };
  packs: {
    list: () => Promise<StickerPack[]>;
    create: (input: { name: string }) => Promise<StickerPack>;
    createFromDirectory: () => Promise<StickerPackDetails | null>;
    rename: (input: { packId: string; name: string }) => Promise<StickerPack>;
    delete: (input: { packId: string }) => Promise<void>;
    get: (packId: string) => Promise<StickerPackDetails>;
    revealSourceFolder: (input: { packId: string }) => Promise<void>;
    setTelegramShortName: (
      input: SetPackTelegramShortNameInput,
    ) => Promise<StickerPack>;
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
    setEmojisMany: (
      input: SetManyAssetEmojisInput,
    ) => Promise<StickerPackDetails>;
    reorder: (input: ReorderAssetInput) => Promise<StickerPackDetails>;
    rename: (input: RenameAssetInput) => Promise<StickerPackDetails>;
    renameMany: (input: RenameManyAssetsInput) => Promise<StickerPackDetails>;
    move: (input: MoveAssetInput) => Promise<StickerPackDetails>;
    delete: (input: DeleteAssetInput) => Promise<StickerPackDetails>;
    deleteMany: (input: DeleteManyAssetsInput) => Promise<StickerPackDetails>;
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

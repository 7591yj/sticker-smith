import type {
  ConversionJobEvent,
  ConvertInput,
  DeleteStickerInput,
  DeleteManyStickersInput,
  ImportResult,
  LibraryConfig,
  MoveStickerInput,
  PublishLocalPackInput,
  ReorderStickerInput,
  RenameStickerInput,
  RenameManyStickersInput,
  SetTelegramPhoneNumberInput,
  SetPackTelegramShortNameInput,
  SetTelegramTdlibParametersInput,
  SetStickerEmojisInput,
  SetManyStickerEmojisInput,
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
    setTelegramShortName: (
      input: SetPackTelegramShortNameInput,
    ) => Promise<StickerPack>;
    setIcon: (input: {
      packId: string;
      stickerId: string | null;
    }) => Promise<StickerPack>;
    chooseIcon: (input: {
      packId: string;
    }) => Promise<StickerPackDetails | null>;
  };
  stickers: {
    importFiles: (input: {
      packId: string;
      filePaths?: string[];
    }) => Promise<ImportResult>;
    importDirectory: (input: {
      packId: string;
      directoryPath?: string;
    }) => Promise<ImportResult>;
    setEmojis: (input: SetStickerEmojisInput) => Promise<StickerPackDetails>;
    setEmojisMany: (
      input: SetManyStickerEmojisInput,
    ) => Promise<StickerPackDetails>;
    reorder: (input: ReorderStickerInput) => Promise<StickerPackDetails>;
    rename: (input: RenameStickerInput) => Promise<StickerPackDetails>;
    renameMany: (input: RenameManyStickersInput) => Promise<StickerPackDetails>;
    move: (input: MoveStickerInput) => Promise<StickerPackDetails>;
    delete: (input: DeleteStickerInput) => Promise<StickerPackDetails>;
    deleteMany: (input: DeleteManyStickersInput) => Promise<StickerPackDetails>;
    revealInFolder: (input: {
      packId: string;
      relativePath?: string;
    }) => Promise<void>;
    exportFolder: (input: { packId: string }) => Promise<string | null>;
  };
  conversion: {
    convert: (
      input: ConvertInput,
    ) => Promise<StickerPackDetails>;
    subscribe: (listener: (event: ConversionJobEvent) => void) => () => void;
  };
}

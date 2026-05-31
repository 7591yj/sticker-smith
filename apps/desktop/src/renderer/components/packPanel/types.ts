import type { StickerPack, StickerPackDetails } from "@sticker-smith/shared";

export interface PackPanelProps {
  details: StickerPackDetails | null;
  converting: boolean;
  telegramConnected: boolean;
  telegramPublishing: boolean;
  telegramUpdating: boolean;
  setDetails: (d: StickerPackDetails | null) => void;
  refreshDetails: (packId: string) => Promise<StickerPackDetails>;
  refreshPacks: () => Promise<StickerPack[]>;
  setSelectedPackId: (id: string | null) => void;
  onPublishLocalPack: (input: {
    packId: string;
    title: string;
    shortName: string;
  }) => Promise<unknown>;
  onDownloadTelegramPackMedia: (input: { packId: string }) => Promise<unknown>;
  onUpdateTelegramPack: (input: { packId: string }) => Promise<unknown>;
}

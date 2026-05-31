import path from "node:path";

import type { TelegramSessionUser } from "@sticker-smith/shared";
import { OWNED_STICKER_SETS_PAGE_SIZE } from "../config/constants";
import { mapStickerSet } from "./telegramTdlibStickerMapping";
import { requireNonEmptyStickerSetShortName, requireTdlibClient } from "./telegramTdlibClientGuard";
import type { TdClient, TelegramRemoteStickerSet } from "./telegramTdlibTypes";

type NewStickerInput = { stickerPath: string; emojis: string[]; format: "video" };

export class TelegramTdlibStickerService {
  constructor(
    private readonly getClient: () => TdClient | null,
    private readonly getSessionUser: () => Promise<TelegramSessionUser | null>,
  ) {}

  private requireClient() {
    return requireTdlibClient(this.getClient());
  }

  private async requireEditContext(shortNameInput: string) {
    const client = this.requireClient();
    const me = await this.getSessionUser();
    if (!me) {
      throw new Error("Telegram user session is not ready.");
    }

    return { client, me, shortName: requireNonEmptyStickerSetShortName(shortNameInput) };
  }

  private async getOwnedStickerSetPage(offsetStickerSetId: string) {
    const response = await this.requireClient().invoke({
      _: "getOwnedStickerSets",
      offset_sticker_set_id: offsetStickerSetId,
      limit: OWNED_STICKER_SETS_PAGE_SIZE,
    });
    return Array.isArray(response?.sets) ? response.sets : [];
  }

  private getNextOwnedStickerSetOffset(chunk: any[]) {
    if (chunk.length < OWNED_STICKER_SETS_PAGE_SIZE) {
      return null;
    }

    const lastSetId = String(chunk.at(-1)?.id ?? "");
    return /^[1-9]\d*$/.test(lastSetId) ? lastSetId : null;
  }

  private async listOwnedStickerSetSummaries() {
    const sets: any[] = [];
    let offsetStickerSetId: string | null = "0";

    while (offsetStickerSetId !== null) {
      const chunk = await this.getOwnedStickerSetPage(offsetStickerSetId);
      if (chunk.length === 0) break;
      sets.push(...chunk);
      offsetStickerSetId = this.getNextOwnedStickerSetOffset(chunk);
    }

    return sets;
  }

  private async getFullStickerSet(set: any) {
    const full = await this.requireClient().invoke({ _: "getStickerSet", set_id: set.id });
    return mapStickerSet(full);
  }

  async getOwnedStickerSets() {
    const sets = await this.listOwnedStickerSetSummaries();
    const fullSets: TelegramRemoteStickerSet[] = [];
    for (const set of sets) fullSets.push(await this.getFullStickerSet(set));
    return fullSets;
  }

  async getStickerSet(stickerSetId: string) {
    const response = await this.requireClient().invoke({ _: "getStickerSet", set_id: stickerSetId });
    return mapStickerSet(response);
  }

  async getRawStickerSet(stickerSetId: string) {
    return this.requireClient().invoke({ _: "getStickerSet", set_id: stickerSetId });
  }

  async createNewStickerSet(input: { title: string; shortName: string; stickers: NewStickerInput[] }) {
    const client = this.requireClient();
    const me = await this.getSessionUser();
    if (!me) throw new Error("Telegram user session is not ready.");

    const [firstSticker, ...rest] = input.stickers;
    const created = await client.invoke({
      _: "createNewStickerSet",
      user_id: me.id,
      title: input.title,
      name: input.shortName,
      sticker_type: { _: "stickerTypeRegular" },
      needs_repainting: false,
      stickers: [this.toInputSticker(firstSticker)],
      source: "Sticker Smith",
    });

    for (const sticker of rest) {
      await client.invoke({
        _: "addStickerToSet",
        user_id: me.id,
        name: input.shortName,
        sticker: this.toInputSticker(sticker),
      });
    }

    return String(created?.id ?? "");
  }

  async checkStickerSetName(shortName: string) {
    const result = await this.requireClient().invoke({ _: "checkStickerSetName", name: shortName });
    switch (result?._) {
      case "checkStickerSetNameResultOk":
      case "ok":
        return;
      case "checkStickerSetNameResultNameInvalid":
        throw new Error("The Telegram sticker short name is invalid. Start with a letter and use only letters, numbers, or underscores.");
      case "checkStickerSetNameResultNameOccupied":
        throw new Error("A Telegram sticker set with that short name already exists.");
      default:
        return;
    }
  }

  async replaceStickerInSet(input: { shortName: string; oldFileId: string; newStickerPath: string; emojis: string[] }) {
    const { client, me, shortName } = await this.requireEditContext(input.shortName);
    await client.invoke({
      _: "replaceStickerInSet",
      user_id: me.id,
      name: shortName,
      old_sticker: { _: "inputFileRemote", id: input.oldFileId },
      new_sticker: this.toInputSticker({ stickerPath: input.newStickerPath, emojis: input.emojis, format: "video" }),
    });
  }

  async addStickerToSet(input: { shortName: string; stickerPath: string; emojis: string[] }) {
    const { client, me, shortName } = await this.requireEditContext(input.shortName);
    await client.invoke({
      _: "addStickerToSet",
      user_id: me.id,
      name: shortName,
      sticker: this.toInputSticker({ stickerPath: input.stickerPath, emojis: input.emojis, format: "video" }),
    });
  }

  async setStickerEmojis(input: { stickerSetId: string; fileId: string; emojis: string[] }) {
    await this.requireClient().invoke({ _: "setStickerEmojis", sticker: { _: "inputFileRemote", id: input.fileId }, emojis: input.emojis.join(" ") });
  }

  async setStickerPositionInSet(input: { fileId: string; position: number }) {
    await this.requireClient().invoke({ _: "setStickerPositionInSet", sticker: { _: "inputFileRemote", id: input.fileId }, position: input.position });
  }

  async removeStickerFromSet(input: { stickerSetId: string; fileId: string }) {
    await this.requireClient().invoke({ _: "removeStickerFromSet", sticker: { _: "inputFileRemote", id: input.fileId } });
  }

  async setStickerSetTitle(input: { shortName: string; title: string }) {
    await this.requireClient().invoke({
      _: "setStickerSetTitle",
      name: requireNonEmptyStickerSetShortName(input.shortName),
      title: input.title,
    });
  }

  async setStickerSetThumbnail(input: { shortName: string; thumbnailPath: string | null; format: "video" | null }) {
    const { client, me, shortName } = await this.requireEditContext(input.shortName);
    await client.invoke({
      _: "setStickerSetThumbnail",
      user_id: me.id,
      name: shortName,
      thumbnail: input.thumbnailPath === null ? null : { _: "inputFileLocal", path: path.resolve(input.thumbnailPath) },
      format: input.format === null ? null : { _: "stickerFormatWebm" },
    });
  }

  private toInputSticker(input: NewStickerInput) {
    return {
      _: "inputSticker",
      sticker: { _: "inputFileLocal", path: path.resolve(input.stickerPath) },
      format: { _: input.format === "video" ? "stickerFormatWebm" : "stickerFormatWebp" },
      emojis: input.emojis.join(" "),
    };
  }
}

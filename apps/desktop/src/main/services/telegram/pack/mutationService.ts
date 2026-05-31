import type {
  PublishLocalPackInput,
  UpdateTelegramPackInput,
} from "@sticker-smith/shared";

import { TelegramPackPublisher } from "./publisher";
import { TelegramPackUpdater } from "./updater";
import type { TelegramPackMutationServiceOptions } from "./mutationTypes";

export type { TelegramPackMutationServiceOptions } from "./mutationTypes";

export class TelegramPackMutationService {
  private readonly publisher: TelegramPackPublisher;
  private readonly updater: TelegramPackUpdater;

  constructor(private readonly options: TelegramPackMutationServiceOptions) {
    this.publisher = new TelegramPackPublisher(this.options);
    this.updater = new TelegramPackUpdater(this.options);
  }

  async publishLocalPack(input: PublishLocalPackInput) {
    await this.options.auth.requireConnectedState();
    return this.publisher.publishLocalPack(input);
  }

  async updateTelegramPack(input: UpdateTelegramPackInput) {
    await this.options.auth.requireConnectedState();
    return this.updater.updateTelegramPack(input);
  }
}

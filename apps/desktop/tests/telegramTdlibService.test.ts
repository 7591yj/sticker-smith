import { describe } from "vitest";
import { registerPathTests } from "./telegramTdlibService/pathTests";
import { registerQueryTests } from "./telegramTdlibService/queryTests";
import { registerStartupTests } from "./telegramTdlibService/startupTests";
import { registerStickerMutationTests } from "./telegramTdlibService/stickerMutationTests";

describe("TelegramTdlibService", () => {
  registerPathTests();
  registerStartupTests();
  registerQueryTests();
  registerStickerMutationTests();
});

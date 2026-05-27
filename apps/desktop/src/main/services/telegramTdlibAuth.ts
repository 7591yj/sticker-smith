import type { TelegramSessionUser } from "@sticker-smith/shared";
import { summarizeTdlibParameters } from "./telegramTdlibMapping";
import type { TdClient, TelegramTdlibCredentials } from "./telegramTdlibTypes";

export class TelegramTdlibAuthController {
  private tdlibParametersSubmitted = false;

  constructor(
    private readonly getClient: () => TdClient | null,
    private readonly getCredentials: () => TelegramTdlibCredentials | null,
    private readonly getSessionUser: () => Promise<TelegramSessionUser | null>,
    private readonly emitAuthStateChanged: (
      authStep:
        | "wait_tdlib_parameters"
        | "wait_phone_number"
        | "wait_code"
        | "wait_password"
        | "ready"
        | "logged_out",
      options?: { sessionUser?: TelegramSessionUser | null },
    ) => void,
  ) {}

  resetParametersSubmitted() {
    this.tdlibParametersSubmitted = false;
  }

  private buildTdlibParameters(credentials: TelegramTdlibCredentials) {
    return {
      _: "setTdlibParameters",
      use_test_dc: false,
      database_directory: credentials.databaseDirectory,
      files_directory: credentials.filesDirectory,
      database_encryption_key: credentials.databaseEncryptionKey,
      use_message_database: true,
      use_secret_chats: false,
      system_language_code: "en",
      application_version: "1.0",
      device_model: "Unknown device",
      system_version: "Unknown",
      api_id: credentials.apiId,
      api_hash: credentials.apiHash,
    };
  }

  private async submitTdlibParameters() {
    this.emitAuthStateChanged("wait_tdlib_parameters");

    const client = this.getClient();
    const credentials = this.getCredentials();
    if (!client || !credentials || this.tdlibParametersSubmitted) return;

    this.tdlibParametersSubmitted = true;
    try {
      await client.invoke(this.buildTdlibParameters(credentials));
    } catch (error) {
      this.tdlibParametersSubmitted = false;
      console.error("TDLib rejected setTdlibParameters", {
        error,
        parameters: summarizeTdlibParameters(credentials),
      });
      throw error;
    }
  }

  private async requestPhoneNumberIfAvailable() {
    this.emitAuthStateChanged("wait_phone_number");
    const phoneNumber = this.getCredentials()?.phoneNumber;
    if (phoneNumber) await this.submitPhoneNumber(phoneNumber);
  }

  async handleAuthorizationState(authorizationState: any) {
    const handlers = {
      authorizationStateWaitTdlibParameters: () => this.submitTdlibParameters(),
      authorizationStateWaitPhoneNumber: () => this.requestPhoneNumberIfAvailable(),
      authorizationStateWaitCode: () => this.emitAuthStateChanged("wait_code"),
      authorizationStateWaitPassword: () => this.emitAuthStateChanged("wait_password"),
      authorizationStateReady: async () =>
        this.emitAuthStateChanged("ready", { sessionUser: await this.getSessionUser() }),
      authorizationStateLoggingOut: () =>
        this.emitAuthStateChanged("logged_out", { sessionUser: null }),
      authorizationStateClosing: () =>
        this.emitAuthStateChanged("logged_out", { sessionUser: null }),
      authorizationStateClosed: () =>
        this.emitAuthStateChanged("logged_out", { sessionUser: null }),
    };

    const handler = handlers[authorizationState?._ as keyof typeof handlers];
    await handler?.();
  }

  async submitPhoneNumber(phoneNumber: string) {
    const client = this.getClient();
    if (!client) throw new Error("TDLib client is not started.");
    await client.invoke({ _: "setAuthenticationPhoneNumber", phone_number: phoneNumber });
  }

  async submitCode(code: string) {
    const client = this.getClient();
    if (!client) throw new Error("TDLib client is not started.");
    await client.invoke({ _: "checkAuthenticationCode", code });
  }

  async submitPassword(password: string) {
    const client = this.getClient();
    if (!client) throw new Error("TDLib client is not started.");
    await client.invoke({ _: "checkAuthenticationPassword", password });
  }

  async logout() {
    const client = this.getClient();
    if (client) await client.invoke({ _: "logOut" });
  }
}

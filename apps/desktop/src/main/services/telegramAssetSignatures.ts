export function createTelegramAssetSignature(
  sha256: string | null,
  emojis: readonly string[],
) {
  return sha256 ? `${sha256}\u0000${emojis.join(" ")}` : null;
}

export function collectTelegramAssetSignatures(input: {
  emojis: readonly string[];
  sha256Values: ReadonlyArray<string | null | undefined>;
}) {
  return input.sha256Values.flatMap((sha256) => {
    const signature = createTelegramAssetSignature(sha256 ?? null, input.emojis);
    return signature ? [signature] : [];
  });
}

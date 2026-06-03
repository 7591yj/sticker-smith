export function hashEmojiList(emojiList: string[]): string {
  const input = emojiList.join("\n");
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

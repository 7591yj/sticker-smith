export function toFileUrl(filePath: string) {
  return `stickersmith-media://preview?path=${encodeURIComponent(filePath)}`;
}

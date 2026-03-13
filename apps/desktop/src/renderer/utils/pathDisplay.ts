export function getLeafName(relativePath: string) {
  return relativePath.split("/").pop() ?? relativePath;
}

export function getFileExtension(filePath: string) {
  return filePath.split(".").pop()?.toLowerCase() ?? "";
}

export function isVideoPath(filePath: string) {
  const extension = getFileExtension(filePath);
  return extension === "mp4" || extension === "webm";
}

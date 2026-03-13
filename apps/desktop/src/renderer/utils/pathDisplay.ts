export function getLeafName(relativePath: string) {
  return relativePath.split("/").pop() ?? relativePath;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function sortItemsWithPinnedFirst<T>(
  items: readonly T[],
  options: {
    getOrder: (item: T) => number;
    isPinned: (item: T) => boolean;
  },
) {
  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftPinned = options.isPinned(left.item);
      const rightPinned = options.isPinned(right.item);

      if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;

      return (
        options.getOrder(left.item) - options.getOrder(right.item) ||
        left.index - right.index
      );
    })
    .map(({ item }) => item);
}

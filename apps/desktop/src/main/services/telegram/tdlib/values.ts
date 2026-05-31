export function asNumber(value: unknown, fallback = 0) {
  return Number(value ?? fallback);
}

export function asPresentString(value: unknown) {
  return value ? String(value) : null;
}

export function getObjectValue(source: any, key: string) {
  return source?.[key];
}

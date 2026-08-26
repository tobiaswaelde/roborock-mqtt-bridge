/** Returns a plain object value, excluding arrays and primitives. */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/** Recursively removes cloud and local credentials before publishing a payload. */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => redact(entry));
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) =>
      /(?:localkey|password|secret|token|rriot)/i.test(key) ? [] : [[key, redact(entry)]],
    ),
  );
}

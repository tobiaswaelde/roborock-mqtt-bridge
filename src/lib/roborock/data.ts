/** Narrows a runtime value to a plain record.
 * @param {unknown} value Runtime value.
 * @returns {Record<string, unknown> | undefined} Record or undefined.
 */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/** Removes cloud and local credentials from an arbitrary publication payload.
 * @param {unknown} value Payload to sanitize.
 * @returns {unknown} Sanitized payload.
 */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => redact(entry));
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) =>
      /(?:localkey|password|secret|token|rriot)/i.test(key) ? [] : [[key, redact(entry)]],
    ),
  );
}

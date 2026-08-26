/** Flattens nested values into slash-separated paths containing MQTT scalar values. */
export function objectToMap(value: unknown, prefix = ''): Map<string, string | number | boolean> {
  const result = new Map<string, string | number | boolean>();

  const visit = (current: unknown, path: string): void => {
    if (Array.isArray(current)) {
      current.forEach((entry, index) => visit(entry, `${path}/${index}`));
      return;
    }
    if (current && typeof current === 'object') {
      Object.entries(current).forEach(([key, entry]) => visit(entry, path ? `${path}/${key}` : key));
      return;
    }
    if (typeof current === 'string' || typeof current === 'number' || typeof current === 'boolean') {
      result.set(path, current);
    }
  };
  visit(value, prefix);
  return result;
}

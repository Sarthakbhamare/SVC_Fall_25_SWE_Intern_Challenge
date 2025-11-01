/**
 * Parse request body from various formats (Buffer, string, object)
 * @param rawBody - The raw request body
 * @returns Parsed object or undefined
 * @throws Error if JSON parsing fails
 */
export function parseRequestBody(rawBody: any): any {
  if (rawBody == null) return undefined;

  // If already an object (and not a Buffer)
  if (typeof rawBody === 'object' && !Buffer.isBuffer(rawBody)) {
    return rawBody;
  }

  // If Buffer -> string -> JSON
  if (Buffer.isBuffer(rawBody)) {
    const str = rawBody.toString('utf8');
    try {
      return JSON.parse(str);
    } catch (err) {
      throw new Error('Invalid JSON body (buffer)');
    }
  }

  // If string -> JSON
  if (typeof rawBody === 'string') {
    try {
      return JSON.parse(rawBody);
    } catch (err) {
      throw new Error('Invalid JSON body (string)');
    }
  }

  // Fallback
  return undefined;
}

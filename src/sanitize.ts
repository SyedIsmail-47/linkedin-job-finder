/**
 * Strip credential-bearing URLs and Telegram bot tokens from strings that may be logged.
 * Never invent content — only redact known secret shapes.
 */
export function sanitizeErrorMessage(message: string): string {
  let out = message;
  // http(s)://user:password@host... (including path/query)
  out = out.replace(/\bhttps?:\/\/[^/\s"'<>]*:[^/\s"'<>]+@[^\s"'<>]+/gi, 'http://***:***@redacted');
  // Telegram Bot API paths embed the token
  out = out.replace(/api\.telegram\.org\/bot[^/\s"'<>]+/gi, 'api.telegram.org/bot***');
  return out;
}

import { describe, expect, it } from 'vitest';
import { sanitizeErrorMessage } from '../src/sanitize.js';

describe('sanitizeErrorMessage', () => {
  it('redacts credentialed proxy URLs', () => {
    const msg = 'request to http://user:s3cret@proxy.example:8000/ failed';
    expect(sanitizeErrorMessage(msg)).toBe('request to http://***:***@redacted failed');
  });

  it('redacts Telegram bot API tokens in URLs', () => {
    const msg = 'fetch failed: https://api.telegram.org/bot123456:ABC-DEF/sendMessage';
    expect(sanitizeErrorMessage(msg)).toContain('api.telegram.org/bot***');
    expect(sanitizeErrorMessage(msg)).not.toContain('123456:ABC-DEF');
  });

  it('leaves ordinary messages unchanged', () => {
    expect(sanitizeErrorMessage('Charge limit reached')).toBe('Charge limit reached');
  });
});

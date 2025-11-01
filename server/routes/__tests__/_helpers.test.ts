import { describe, it, expect } from 'vitest';
import { parseRequestBody } from '../_helpers';

describe('parseRequestBody', () => {
  it('returns undefined for null', () => {
    expect(parseRequestBody(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(parseRequestBody(undefined)).toBeUndefined();
  });

  it('returns object as-is when already parsed', () => {
    const obj = { test: 'value' };
    expect(parseRequestBody(obj)).toEqual(obj);
  });

  it('parses Buffer to JSON', () => {
    const buffer = Buffer.from('{"key":"value"}');
    expect(parseRequestBody(buffer)).toEqual({ key: 'value' });
  });

  it('throws error for invalid JSON in Buffer', () => {
    const buffer = Buffer.from('{invalid}');
    expect(() => parseRequestBody(buffer)).toThrow('Invalid JSON body (buffer)');
  });

  it('parses string to JSON', () => {
    const str = '{"key":"value"}';
    expect(parseRequestBody(str)).toEqual({ key: 'value' });
  });

  it('throws error for invalid JSON in string', () => {
    const str = '{invalid}';
    expect(() => parseRequestBody(str)).toThrow('Invalid JSON body (string)');
  });

  it('returns undefined for unexpected types (covers line 35-36)', () => {
    // Pass a number, which is not null, not object, not Buffer, not string
    expect(parseRequestBody(123 as any)).toBeUndefined();
    expect(parseRequestBody(true as any)).toBeUndefined();
    expect(parseRequestBody(Symbol('test') as any)).toBeUndefined();
  });
});

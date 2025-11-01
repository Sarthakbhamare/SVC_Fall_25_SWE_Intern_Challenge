import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('merges classes', () => {
    expect(cn('text-red-500', 'bg-blue-500')).toBe('text-red-500 bg-blue-500');
  });

  it('supports conditional booleans', () => {
    const isActive = true;
    expect(cn('base-class', isActive && 'active-class')).toBe('base-class active-class');
  });

  it('ignores falsy values', () => {
    const isActive = false;
    expect(cn('base-class', isActive && 'active-class', null, undefined)).toBe('base-class');
  });

  it('merges tailwind utilities correctly', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });

  it('supports object notation', () => {
    expect(cn('base', { conditional: true, 'not-included': false })).toBe('base conditional');
  });
});

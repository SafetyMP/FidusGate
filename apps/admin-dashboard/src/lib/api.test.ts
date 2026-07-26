import { describe, expect, it } from 'vitest';
import { assertSafeResourceId, buildAuthHeaders } from './api';

describe('buildAuthHeaders', () => {
  it('adds bearer token when present', () => {
    expect(buildAuthHeaders('abc.def')).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer abc.def',
    });
  });

  it('omits authorization when token is null', () => {
    expect(buildAuthHeaders(null)).toEqual({
      'Content-Type': 'application/json',
    });
  });
});

describe('assertSafeResourceId', () => {
  it('accepts safe identifiers', () => {
    expect(assertSafeResourceId('admin@fidusgate.internal', 'principal')).toBe(
      'admin@fidusgate.internal',
    );
  });

  it('rejects unsafe identifiers', () => {
    expect(() => assertSafeResourceId('../etc/passwd', 'path')).toThrow('Invalid path');
  });
});

/**
 * Test that authScheme: "" correctly sends token without prefix
 */

import { describe, it, expect } from 'bun:test';

// Replicate the buildHeaders logic
function buildHeadersOld(authScheme: string | undefined, token: string): string {
  const scheme = authScheme || 'Bearer';  // OLD: treats "" as falsy
  return `${scheme} ${token}`;
}

function buildHeadersNew(authScheme: string | undefined, token: string): string {
  const scheme = authScheme ?? 'Bearer';  // NEW: only undefined/null fallback
  return scheme ? `${scheme} ${token}` : token;
}

describe('authScheme empty string behavior', () => {
  const token = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test';

  it('OLD behavior: empty string incorrectly defaults to Bearer', () => {
    // This demonstrates the bug
    expect(buildHeadersOld('', token)).toBe(`Bearer ${token}`);
    expect(buildHeadersOld(undefined, token)).toBe(`Bearer ${token}`);
    expect(buildHeadersOld('Token', token)).toBe(`Token ${token}`);
  });

  it('NEW behavior: empty string sends token without prefix', () => {
    // This is the fixed behavior
    expect(buildHeadersNew('', token)).toBe(token);  // No prefix!
    expect(buildHeadersNew(undefined, token)).toBe(`Bearer ${token}`);
    expect(buildHeadersNew('Token', token)).toBe(`Token ${token}`);
  });

  it('demonstrates the difference', () => {
    const emptyScheme = '';

    console.log('\n--- authScheme: "" ---');
    console.log('OLD (||):', buildHeadersOld(emptyScheme, token));
    console.log('NEW (??):', buildHeadersNew(emptyScheme, token));

    // The key assertion: empty string should NOT add a prefix
    expect(buildHeadersNew(emptyScheme, token)).not.toContain('Bearer');
    expect(buildHeadersNew(emptyScheme, token)).toBe(token);
  });
});

/**
 * Deterministic PRNG and hashing.
 *
 * Everything here uses only 32-bit unsigned integer arithmetic so the exact
 * same sequence can be reproduced in any language (a future Rust server would
 * use u32 wrapping_mul / wrapping_add and get identical output).
 */

/** FNV-1a 32-bit hash of a string's UTF-8 bytes. */
export function fnv1a(input: string): number {
  const bytes = new TextEncoder().encode(input);
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Mulberry32: small, fast, well-distributed 32-bit PRNG.
 * Returns integers in [0, 2^32).
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  nextU32(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let z = this.state;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return (z ^ (z >>> 14)) >>> 0;
  }

  /**
   * Integer in [0, bound) without modulo bias, via rejection sampling.
   * bound must be in [1, 2^32).
   */
  nextBelow(bound: number): number {
    // Reject values in the "short" final bucket so every result is equally likely.
    const limit = 4294967296 - (4294967296 % bound);
    let value = this.nextU32();
    while (value >= limit) {
      value = this.nextU32();
    }
    return value % bound;
  }

  /** In-place Fisher-Yates shuffle. */
  shuffle<T>(items: T[]): void {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.nextBelow(i + 1);
      const tmp = items[i]!;
      items[i] = items[j]!;
      items[j] = tmp;
    }
  }
}

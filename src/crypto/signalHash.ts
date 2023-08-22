import { hexlify } from '@ethersproject/bytes';
import { toUtf8Bytes } from '@ethersproject/strings';
import { keccak256 } from '@ethersproject/keccak256';

/**
 * Hashes a signal string with Keccak256.
 * @param signal The RLN signal.
 * @returns The signal hash.
 */
export function calculateSignalHash(signal: string): bigint {
  const converted = hexlify(toUtf8Bytes(signal));
  return BigInt(keccak256(converted)) >> BigInt(8);
}

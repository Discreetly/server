/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { poseidon2 } from 'poseidon-lite/poseidon2';
import { EdwardsPoint } from './babyJubjub';
import { MembershipProof } from './jubmoji.types';

export const hexToBigInt = (hex: string): bigint => {
  return BigInt(`0x${hex}`);
};

export const bigIntToHex = (bigInt: bigint): string => {
  return bigInt.toString(16);
};

/**
 * Hashes an EdwardsPoint to a bigint. Uses the Poseidon hash function
 * @param pubKey - The public key to hash
 * @param hashFn - Optional hash function to use. Defaults to Poseidon
 * @returns The hash of the public key
 */
export const hashEdwardsPublicKey = (pubKey: EdwardsPoint): bigint => {
  const hash = poseidon2([pubKey.x, pubKey.y]);

  return hexToBigInt(hash.toString());
};

export const deserializeMembershipProof = (serializedProof: string): MembershipProof => {
  const proof = JSON.parse(serializedProof);
  const R = EdwardsPoint.deserialize(proof.R);
  const msgHash = hexToBigInt(proof.msgHash);
  const zkp = proof.zkp;

  return { R, msgHash, zkp };
};

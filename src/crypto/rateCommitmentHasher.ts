import { poseidon2 } from 'poseidon-lite/poseidon2';

export function getRateCommitmentHash(
  identityCommitment: bigint,
  userMessageLimit: number | bigint
): bigint {
  return poseidon2([identityCommitment, userMessageLimit]);
}

import { poseidon2 } from 'poseidon-lite/poseidon2';

function getRateCommitmentHash(identityCommitment: bigint, userMessageLimit: number | bigint) {
  return poseidon2([identityCommitment, userMessageLimit]);
}

export default getRateCommitmentHash;

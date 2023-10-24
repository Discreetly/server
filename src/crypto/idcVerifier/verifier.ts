import { Prover, Verifier } from 'idc-nullifier';
import vkey from './vkey';
import { SNARKProof } from 'idc-nullifier/dist/types/types';
import { Identity } from '@semaphore-protocol/identity';


export async function verifyIdentityProof (proof: SNARKProof): Promise<boolean> {
  const verifier = new Verifier(vkey);

  const isValid = await verifier.verifyProof(proof);
  return isValid
}

export async function generateIdentityProof (identity: Identity, nullifier: bigint): Promise<SNARKProof> {

  const prover = new Prover();

  const proof = await prover.generateProof({identity: identity, externalNullifier: nullifier});

  return proof;
}

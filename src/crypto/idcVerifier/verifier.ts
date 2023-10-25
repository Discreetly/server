import { Prover, Verifier } from 'idc-nullifier';
import vkey from './vkey';
import { IDCProof } from 'idc-nullifier/dist/types/types';
import { Identity } from '@semaphore-protocol/identity';

export async function verifyIdentityProof(proof: IDCProof): Promise<boolean> {
  const verifier = new Verifier(vkey);

  const isValid = await verifier.verifyProof(proof);
  return isValid;
}

export async function generateIdentityProof(
  identity: Identity,
  nullifier: bigint
): Promise<IDCProof> {
  const prover = new Prover();

  const proof = await prover.generateProof({
    identity: identity,
    externalNullifier: nullifier
  });

  return proof;
}

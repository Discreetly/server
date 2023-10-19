import { Verifier } from 'idc-nullifier';
import vkey from './vkey';
import { SNARKProof } from 'idc-nullifier/dist/types/types';



export async function verifyIdentityProof (proof: SNARKProof): Promise<boolean> {
  const verifier = new Verifier(vkey);

  const isValid = await verifier.verifyProof(proof);
  return isValid
}

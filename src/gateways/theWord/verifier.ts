import { groth16 } from 'snarkjs';
import vkey from './vkey';
import { SNARKProof } from 'idc-nullifier';


export async function verifyTheWordProof(proof: SNARKProof): Promise<boolean> {

  const isValid = groth16.verify(vkey, proof.publicSignals, proof.proof);

  return isValid;
}

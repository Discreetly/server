import { SNARKProof } from '../../types';
import { groth16 } from 'snarkjs';
import vkey from './vkey';


export async function verifyTheWordProof(proof: SNARKProof): Promise<boolean> {


  const isValid = groth16.verify(vkey, proof.publicSignals, proof.proof);

  return isValid;
}

import { Prover, Verifier } from 'idc-nullifier';
import vkey from './vkey';
import { SNARKProof } from 'idc-nullifier/dist/types/types';
import { Identity } from '@semaphore-protocol/identity';

// import fs from 'fs';
// import path from 'path';

// const zKeyRoot = path.resolve(__dirname, '../../../node_modules/idc-nullifier/dist/zkeyFiles/idcNullifier/circuit_final.zkey')
// console.log(zKeyRoot)
// const zkey = fs.readFileSync(zKeyRoot);
// const zkeyBuffer = fs.readFileSync('../../../node_modules/idc-nullifier/dist/zkeyFiles/idcNullifier/circuit_final.zkey');
// const wasmBuffer = fs.readFileSync('../../../node_modules/idc-nullifier/dist/zkeyFiles/idcNullifier/circuit.wasm');

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

import { MessageI, str2BigInt } from 'discreetly-interfaces';
import { RLNVerifier } from 'rlnjs';
import vkey from './verification_key';
import { poseidon1 } from 'poseidon-lite/poseidon1';

const v = new RLNVerifier(vkey);

async function verifyProof(msg: MessageI): Promise<boolean> {
  // FIXME NEED TO VALIDATE THE FOLLOWING (IN THIS ORDER):
  // TODO EPOCH FALLS WITHIN RANGE FOR ROOM
  // TODO INTERNAL NULLIFIER
  // TODO MESSAGE HASH IS CORRECT
  // TODO VERIFY MERKLE ROOT
  // TODO VERIFY PROOF LAST
  //
  const rlnIdentifier = BigInt(msg.room);
  const msgHash = str2BigInt(msg.message);
  if (msgHash !== msg.proof.snarkProof.publicSignals.x) {
    return false;
  }
  return v.verifyProof(rlnIdentifier, msg.proof);
}

export default verifyProof;

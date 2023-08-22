import type { MessageI, RoomI } from 'discreetly-interfaces';
import { str2BigInt } from 'discreetly-interfaces';
import { RLNFullProof, RLNVerifier } from 'rlnjs';
import vkey from './verification_key';
import { Group } from '@semaphore-protocol/group';

const v = new RLNVerifier(vkey);

async function verifyProof(msg: MessageI, room: RoomI, epochErrorRange = 5): Promise<boolean> {
  if (!msg.roomId || !msg.message || !msg.proof || !msg.epoch) {
    console.warn('Missing required fields:', msg);
    return false;
  }
  console.debug(`Verifying message ${msg.messageId} for room ${room.roomId}`);
  const timestamp = Date.now();
  const rateLimit = room.rateLimit ? room.rateLimit : 1000;
  const currentEpoch = Math.floor(timestamp / rateLimit);
  const rlnIdentifier = BigInt(msg.roomId);
  const msgHash = str2BigInt(msg.message);
  let proof: RLNFullProof | undefined;
  // Check that the epoch falls within the range for the room
  const epoch = BigInt(msg.epoch);
  if (epoch < currentEpoch - epochErrorRange || epoch > currentEpoch + epochErrorRange) {
    // Too old or too far in the future
    console.warn('Epoch out of range:', epoch, 'currentEpoch:', currentEpoch);
    return false;
  }
  if (typeof msg.proof === 'string') {
    proof = JSON.parse(msg.proof) as RLNFullProof;
  } else {
    console.warn('Invalid proof format:', msg.proof);
    return false;
  }
  if (!proof) {
    console.warn('Proof is undefined:', msg.proof);
    return false;
  }

  // Check that the message hash is correct

  if (msgHash !== proof.snarkProof.publicSignals.x) {
    console.warn(
      'Message hash incorrect:',
      msgHash,
      'Hash in proof:',
      proof.snarkProof.publicSignals.x
    );
    return false;
  }

  // Check that the merkle root is correct
  if (room.identities && Array.isArray(room.identities)) {
    const group = new Group(room.id, 20, room.identities as bigint[] | undefined);
    if (group.root !== proof.snarkProof.publicSignals.root) {
      return false;
    }
  }

  // Check that the proof is correct
  return v.verifyProof(rlnIdentifier, proof);
}

export default verifyProof;

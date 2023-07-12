import type { MessageI, RoomGroupI } from 'discreetly-interfaces';
import { str2BigInt } from 'discreetly-interfaces';
import { RLNVerifier } from 'rlnjs';
import vkey from './verification_key';
import { poseidon1 } from 'poseidon-lite/poseidon1';
import { findRoomById } from './utils';
import { Group } from '@semaphore-protocol/group';

const v = new RLNVerifier(vkey);

async function verifyProof(msg: MessageI, roomGroups: RoomGroupI[]): Promise<boolean> {
  // FIXME NEED TO VALIDATE THE FOLLOWING (IN THIS ORDER):
  // TODO EPOCH FALLS WITHIN RANGE FOR ROOM
  // TODO INTERNAL NULLIFIER
  // TODO MESSAGE HASH IS CORRECT
  // TODO VERIFY MERKLE ROOT
  // TODO VERIFY PROOF LAST
  const { room } = findRoomById(roomGroups, msg.room);
  if (!room) {
    console.warn('Room not found');
    return false;
  }
  console.log('check room', room);
  const timestamp = Date.now();
  const currentEpoch = Math.floor(timestamp / room.rateLimit);
  const rlnIdentifier = BigInt(msg.room);
  const msgHash = str2BigInt(msg.message);
  // Check that the epoch falls within the range for the room
  const epoch = BigInt(msg.epoch);
  if (epoch < currentEpoch - 1 || epoch > currentEpoch + 1) {
    // Too old or too far in the future
    console.warn('Epoch out of range:', epoch, 'currentEpoch:', currentEpoch);
    return false;
  }

  // Check that the internal nullifier doesn't have collisions
  // TODO RLNjs cache

  // Check that the message hash is correct
  if (msgHash !== msg.proof.snarkProof.publicSignals.x) {
    console.warn(
      'Message hash incorrect:',
      msgHash,
      'Hash in proof:',
      msg.proof.snarkProof.publicSignals.x
    );
    return false;
  }

  // Check that the merkle root is correct
  const group = new Group(room.id, 20, room.membership?.identityCommitments);
  if (group.root !== msg.proof.snarkProof.publicSignals.root) {
    return false;
  }

  // Check that the proof is correct
  return v.verifyProof(rlnIdentifier, msg.proof);
}

export default verifyProof;

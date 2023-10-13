import { createMessageInRoom, findRoomWithMessageId, removeIdentityFromRoom } from './db/';
import { MessageI, RoomI } from 'discreetly-interfaces';
import { shamirRecovery, getIdentityCommitmentFromSecret } from '../crypto/shamirRecovery';
import { RLNFullProof } from 'rlnjs';
import { verifyProof } from '../crypto/';

interface CollisionCheckResult {
  collision: boolean;
  secret?: bigint;
  oldMessage?: MessageI;
}

/**
 * This code is used to check if there is a collision in the room, and if there is, to recover the secret.
 * It does this by checking if the message already exists in the DB, and if it does, it uses the secret recovery algorithm to recover the secret.
 * @param {string} roomId - The ID of the room to check for collisions in
 * @param {MessageI} message - The message to check for collisions with
 * @returns {Promise<CollisionCheckResult>} - Returns a promise that resolves to a CollisionCheckResult
 */

async function checkRLNCollision(roomId: string, message: MessageI): Promise<CollisionCheckResult> {
  const oldMessage: MessageI | null = await findRoomWithMessageId(roomId, message);

  if (!message.proof) {
    throw new Error('Proof not provided');
  }

  if (!oldMessage?.proof) {
    console.debug('No collision', oldMessage);
    return { collision: false } as CollisionCheckResult;
  } else {
    let oldMessageProof: RLNFullProof;
    if (typeof oldMessage.proof === 'string') {
      oldMessageProof = JSON.parse(oldMessage.proof) as RLNFullProof;
    } else {
      oldMessageProof = oldMessage.proof;
    }
    const oldMessagex2 = BigInt(oldMessageProof.snarkProof.publicSignals.x);
    const oldMessagey2 = BigInt(oldMessageProof.snarkProof.publicSignals.y);

    let proof: RLNFullProof;

    if (typeof message.proof === 'string') {
      proof = JSON.parse(message.proof) as RLNFullProof;
    } else {
      proof = message.proof;
    }
    const [x1, y1] = [
      BigInt(proof.snarkProof.publicSignals.x),
      BigInt(proof.snarkProof.publicSignals.y)
    ];
    const [x2, y2] = [oldMessagex2, oldMessagey2];

    const secret = shamirRecovery(x1, x2, y1, y2);

    return {
      collision: true,
      secret,
      oldMessage: oldMessage
    } as CollisionCheckResult;
  }
}

export interface validateMessageResult {
  success: boolean;
  message?: MessageI;
  idc?: string | bigint;
}

async function handleCollision(
  room: RoomI,
  message: MessageI,
  collisionResult: CollisionCheckResult
): Promise<validateMessageResult> {
  const roomId = room.roomId.toString();
  if (!collisionResult.collision) {
    try {
      if (!room.ephemeral) {
        await createMessageInRoom(roomId, message);
        console.debug(
          `Message added to room: ${
            typeof message.message === 'string'
              ? message.message.slice(0, 10)
              : JSON.stringify(message.message).slice(0, 10)
          }...`
        );
      } else {
        // TODO! Need to store roomId/message in a cache to check for collisions, but then drop the messages once the epoch has passed
        console.debug('Ephemeral room, not adding message to DB');
      }

      return { success: true };
    } catch (error) {
      console.error(`Couldn't add message room ${error}`);
      return { success: false };
    }
  } else {
    console.warn('Collision found');
    const identityCommitment = getIdentityCommitmentFromSecret(collisionResult.secret!);
    try {
      await removeIdentityFromRoom(identityCommitment.toString(), room);
      return { success: false, idc: identityCommitment.toString() };
    } catch (error) {
      console.error(`Couldn't remove identity from room ${error}`);
    }
  }
  return { success: false };
}

/**
 * Validates a message and adds it to the room if it is valid.
 * @param {RoomI} room - The room which the message will be added
 * @param {MessageI} message - The message to be created
 * @returns {Promise<validateMessageResult>} - A result object which contains a boolean indicating whether the operation was successful
 */
export async function validateMessage(
  room: RoomI,
  message: MessageI
): Promise<validateMessageResult> {
  const roomId = room.roomId.toString();
  const validProof: boolean = await verifyProof(room, message);
  if (validProof) {
    const collisionResult = await checkRLNCollision(roomId, message);
    const result = await handleCollision(room, message, collisionResult);
    return result;
  }
  return { success: false };
}

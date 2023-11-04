import { createMessageInRoom, findRoomWithMessageId } from './db/';
import { MessageI, RoomI } from 'discreetly-interfaces';
import { shamirRecovery } from '../crypto/shamirRecovery';
import { RLNFullProof } from 'rlnjs';
import { verifyProof } from '../crypto/';

const EPHEMERAL_EPOCH_AGE = 2;

interface CollisionCheckResult {
  collision: boolean;
  secret?: bigint;
  oldMessage?: MessageI;
}

type roomIdT = string;
type epochT = string;
type epoch = Record<epochT, MessageI[]>;
type EphemeralMessagesI = Record<roomIdT, epoch>;

const ephemeralMessageStore: EphemeralMessagesI = {};

function checkEmphemeralStore(roomId: string, message: MessageI): MessageI | null {
  // Check ephemeralMessages
  const epoch = message.epoch?.toString();
  if (ephemeralMessageStore[roomId] && epoch) {
    if (ephemeralMessageStore[roomId][epoch]) {
      ephemeralMessageStore[roomId][epoch].forEach((oldMessage) => {
        if (oldMessage.messageId === message.messageId) {
          return oldMessage;
        }
      });
    }
  }
  return null;
}

function addMessageToEphemeralStore(roomId: string, message: MessageI) {
  const currentEpoch = String(message.epoch);

  // Add roomId if it doesn't exist
  if (!ephemeralMessageStore[roomId]) {
    ephemeralMessageStore[roomId] = {};
  }

  // delete old epochs
  Object.keys(ephemeralMessageStore[roomId]).forEach((epoch) => {
    if (Number(epoch) < Number(currentEpoch) - EPHEMERAL_EPOCH_AGE) {
      delete ephemeralMessageStore[roomId][epoch];
    }
  });

  // Add epoch if it doesn't exist
  if (!ephemeralMessageStore[roomId][currentEpoch]) {
    ephemeralMessageStore[roomId][currentEpoch] = [];
  }
  ephemeralMessageStore[roomId][currentEpoch].push(message);
}

/**
 * This code is used to check if there is a collision in the room, and if there is, to recover the secret.
 * It does this by checking if the message already exists in the DB, and if it does, it uses the secret recovery algorithm to recover the secret.
 * @param {string} roomId - The ID of the room to check for collisions in
 * @param {MessageI} message - The message to check for collisions with
 * @returns {Promise<CollisionCheckResult>} - Returns a promise that resolves to a CollisionCheckResult
 */
async function checkRLNCollision(room: RoomI, message: MessageI): Promise<CollisionCheckResult> {
  const roomId = room.roomId.toString();
  let oldMessage: MessageI;
  const oldDBMessage: MessageI | null = await findRoomWithMessageId(roomId, message);

  const oldEphemeralMessage: MessageI | null = checkEmphemeralStore(roomId, message);
  if (room.ephemeral === 'EPHEMERAL') {
    addMessageToEphemeralStore(roomId, message);
  }

  if (!message.proof) {
    throw new Error('Proof not provided');
  }

  if (!oldDBMessage?.proof && !oldEphemeralMessage?.proof) {
    console.debug('No collision');
    return { collision: false } as CollisionCheckResult;
  } else {
    let oldMessageProof: RLNFullProof;
    let oldMessageX2: bigint;
    let oldMessageY2: bigint;
    let newMessageProof: RLNFullProof;

    // Collision Found, determine if the collsion is from an ephemeral message or a DB message
    if (oldEphemeralMessage?.proof) {
      if (typeof oldEphemeralMessage.proof === 'string') {
        oldMessageProof = JSON.parse(oldEphemeralMessage.proof) as RLNFullProof;
      } else {
        oldMessageProof = oldEphemeralMessage.proof!;
      }
      oldMessageX2 = BigInt(oldMessageProof.snarkProof.publicSignals.x);
      oldMessageY2 = BigInt(oldMessageProof.snarkProof.publicSignals.y);
      oldMessage = oldEphemeralMessage;
    } else if (oldDBMessage?.proof) {
      if (typeof oldDBMessage.proof === 'string') {
        oldMessageProof = JSON.parse(oldDBMessage.proof) as RLNFullProof;
      } else {
        oldMessageProof = oldDBMessage.proof!;
      }
      oldMessageX2 = BigInt(oldMessageProof.snarkProof.publicSignals.x);
      oldMessageY2 = BigInt(oldMessageProof.snarkProof.publicSignals.y);
      oldMessage = oldDBMessage;
    } else {
      throw new Error('Collision found but no old message found, something is wrong');
    }

    // Recover the secret
    if (typeof message.proof === 'string') {
      newMessageProof = JSON.parse(message.proof) as RLNFullProof;
    } else {
      newMessageProof = message.proof;
    }

    const [newMessageX1, newMessageY1] = [
      BigInt(newMessageProof.snarkProof.publicSignals.x),
      BigInt(newMessageProof.snarkProof.publicSignals.y)
    ];

    const secret = shamirRecovery(newMessageX1, oldMessageX2, newMessageY1, oldMessageY2);

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
      if (room.ephemeral != 'EPHEMERAL') {
        await createMessageInRoom(roomId, message);
        console.debug(
          `Message added to room: ${
            typeof message.message === 'string'
              ? message.message.slice(0, 10)
              : JSON.stringify(message.message).slice(0, 10)
          }...`
        );
      }
      return { success: true };
    } catch (error) {
      console.error(`Couldn't add message room ${error}`);
      return { success: false };
    }
  } else {
    console.warn('Collision found');
    // TODO! We should make this a bit more nuanced, instead of just banning someone outright. For now, we can just not propagate the message.
    return { success: false };
    // const identityCommitment = getIdentityCommitmentFromSecret(
    //   collisionResult.secret!
    // );
    // try {
    //   await removeIdentityFromRoom(identityCommitment.toString(), room);
    //   return { success: false, idc: identityCommitment.toString() };
    // } catch (error) {
    //   console.error(`Couldn't remove identity from room ${error}`);
    // }
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
  const validProof: boolean = await verifyProof(room, message);
  if (validProof) {
    const collisionResult = await checkRLNCollision(room, message);
    const result = await handleCollision(room, message, collisionResult);
    return result;
  }
  return { success: false };
}

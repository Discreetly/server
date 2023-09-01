import { removeIdentityFromRoom } from './db';
import { PrismaClient } from '@prisma/client';
import { MessageI, RoomI } from 'discreetly-interfaces';
import { shamirRecovery, getIdentityCommitmentFromSecret } from '../crypto/shamirRecovery';
import { RLNFullProof } from 'rlnjs';
import verifyProof from '../crypto/verifier';

const prisma = new PrismaClient();

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
  return new Promise((res) => {
    prisma.rooms
      .findFirst({
        where: { roomId },
        include: {
          epochs: {
            where: { epoch: String(message.epoch) },
            include: {
              messages: {
                where: { messageId: message.messageId }
              }
            }
          }
        }
      })
      .then((oldMessage) => {
        if (!message.proof) {
          throw new Error('Proof not provided');
        }

        if (
          !oldMessage ||
          !oldMessage?.epochs[0]?.messages ||
          !oldMessage?.epochs[0]?.messages[0] ||
          !oldMessage?.epochs[0]?.messages[0]?.proof
        ) {
          console.debug('No collision', oldMessage);
          res({ collision: false } as CollisionCheckResult);
        } else {
          const oldMessageProof = JSON.parse(
            oldMessage.epochs[0].messages[0].proof
          ) as RLNFullProof;
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

          res({
            collision: true,
            secret,
            oldMessage: oldMessage.epochs[0].messages[0] as unknown as MessageI
          } as CollisionCheckResult);
        }
      })
      .catch((err) => console.error(err));
  });
}

/**
 * Adds a message to a room.
 * @param {string} roomId - The ID of the room to add the message to.
 * @param {MessageI} message - The message to add to the room.
 * @returns {Promise<unknown>} - A promise that resolves when the message has been added to the room.
 */

function addMessageToRoom(roomId: string, message: MessageI): Promise<unknown> {
  if (!message.epoch) {
    throw new Error('Epoch not provided');
  }
  return prisma.rooms.update({
    where: {
      roomId: roomId
    },
    data: {
      epochs: {
        create: {
          epoch: String(message.epoch),
          messages: {
            create: {
              message: message.message ? String(message.message) : '',
              messageId: message.messageId ? message.messageId.toString() : '',
              proof: JSON.stringify(message.proof),
              roomId: roomId
            }
          }
        }
      }
    }
  });
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
      await addMessageToRoom(roomId, message);
      console.debug(
        `Message added to room: ${
          typeof message.message === 'string'
            ? message.message.slice(0, 10)
            : JSON.stringify(message.message).slice(0, 10)
        }...`
      );
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
  const validProof = await verifyProof(message, room);
  if (validProof) {
    const collisionResult = await checkRLNCollision(roomId, message);
    const result = await handleCollision(room, message, collisionResult);
    return result;
  }
  return { success: false };
}

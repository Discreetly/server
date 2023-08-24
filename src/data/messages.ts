import { getRoomByID, removeIdentityFromRoom } from './db';
import { PrismaClient } from '@prisma/client';
import { MessageI } from 'discreetly-interfaces';
import {
  shamirRecovery,
  getIdentityCommitmentFromSecret
} from '../crypto/shamirRecovery';
import { RLNFullProof } from 'rlnjs';

const prisma = new PrismaClient();

interface CollisionCheckResult {
  collision: boolean;
  secret?: bigint;
  oldMessage?: MessageI;
}

/* Function to check for potential collisions between
the new message and existing messages in the given room
*/
async function checkRLNCollision(
  roomId: string,
  message: MessageI
): Promise<CollisionCheckResult> {
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
        // If the message's proof is not provided, the function throws an error.
        if (!message.proof) {
          throw new Error('Proof not provided');
        }
        /*
        If no matching message exists in the database for the provided room and epoch,
        the function concludes that there's no collision.
        */
        if (!oldMessage || !oldMessage?.epochs[0]?.messages) {
          res({ collision: false } as CollisionCheckResult);
        } else {
          /*
          If there's an existing message,
          compare the proofs of the current and old messages.
          */
          const oldMessageProof = JSON.parse(
            oldMessage.epochs[0].messages[0].proof
          ) as RLNFullProof;
          const oldMessagex2 = BigInt(
            oldMessageProof.snarkProof.publicSignals.x
          );
          const oldMessagey2 = BigInt(
            oldMessageProof.snarkProof.publicSignals.y
          );

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
          /* if there is a collision it performs Shamir's secret sharing recovery to
          find any secret based on the proofs. */
          const secret = shamirRecovery(x1, x2, y1, y2);
          /*
          If a secret is recovered, it indicates a collision,
          and the function returns information about the collision,
          the recovered secret, and the old message.
          */
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

// Helper function to add a message to a room for createMessage
function addMessageToRoom(roomId: string, message: MessageI): Promise<unknown> {
  if (!message.epoch) {
    // Check if the message has an epoch, if not throw an error
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
              message: message.message ? message.message.toString() : '',
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
export interface createMessageResult {
  success: boolean;
  message?: MessageI;
  idc?: string | bigint;
}

export function createMessage(
  roomId: string,
  message: MessageI
): Promise<createMessageResult> {
  return new Promise((resolve, reject) => {
    getRoomByID(roomId)
      .then(async (room) => {
        if (room) {
          // Todo This should check that there is no duplicate messageId with in this room and epoch,
          // if there is, we need to return an error and
          // reconstruct the secret from both messages, and ban the user

          /*
          Check for potential collisions between
           the new message and existing messages in the given room
          */
          await checkRLNCollision(roomId, message)
            .then((collisionResult) => {
              console.log('HERE', collisionResult);
              // If theres no collision, proceed to add the message to the room
              if (!collisionResult.collision) {
                addMessageToRoom(roomId, message)
                  .then(() => {
                    console.log('Message added to room');
                    return resolve({ success: true });
                  })
                  .catch((error) => {
                    console.error(`Couldn't add message room ${error}`);
                    return reject({ success: false });
                  });
              } else {
                /*
                If there's a collision, remove the identity from the room
                */
                console.debug('Collision found');
                const identityCommitment = getIdentityCommitmentFromSecret(
                  collisionResult.secret!
                );
                removeIdentityFromRoom(identityCommitment.toString(), room)
                  .then(() => {
                    return reject({ success: false });
                  })
                  .catch((error) => {
                    console.error(
                      `Couldn't remove identity from room ${error}`
                    );
                  });
              }
            })
            .catch((error) => {
              console.error(`Error getting room: ${error}`);
              return reject({ success: false });
            });
        }
      })
      .catch((error) => {
        console.error(`Error getting room: ${error}`);
        return reject({ success: false });
      });
  });
}

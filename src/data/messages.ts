import { getRoomByID } from './db';
import { PrismaClient } from '@prisma/client';
import { MessageI } from 'discreetly-interfaces';
import { shamirRecovery } from '../crypto/shamirRecovery';
import { RLNFullProof } from 'rlnjs';

const prisma = new PrismaClient();

interface CollisionCheckResult {
  collision: boolean;
  secret?: bigint;
  oldMessage?: MessageI;
}

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
        if (!oldMessage) {
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

interface createMessageResult {
  success: boolean;
  message?: MessageI;
  idc: string | bigint;
}

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

export function createMessage(roomId: string, message: MessageI): createMessageResult {
  getRoomByID(roomId)
    .then((room) => {
      if (room) {
        // Todo This should check that there is no duplicate messageId with in this room and epoch,
        // if there is, we need to return an error and
        // reconstruct the secret from both messages, and ban the user
        checkRLNCollision(roomId, message)
          .then((collisionResult) => {
            if (!collisionResult.collision) {
              addMessageToRoom(roomId, message)
                .then((roomToUpdate) => {
                  console.log(roomToUpdate);
                  return { success: true };
                })
                .catch((error) => {
                  console.error(`Couldn't add message room ${error}`);
                  return false;
                });
            } else {
              console.log('Collision found');
              return false;
            }
          })
          .catch((error) => {
            console.error(`Error getting room: ${error}`);
            return false;
          });
      }
    })
    .catch((error) => {
      console.error(`Error getting room: ${error}`);
      return false;
    });
  return false;
}

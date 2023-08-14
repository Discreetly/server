import { getRoomByID } from './db';
import { PrismaClient } from '@prisma/client';
import { MessageI } from 'discreetly-interfaces';

const prisma = new PrismaClient();

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

export function createMessage(roomId: string, message: MessageI): boolean {
  getRoomByID(roomId)
    .then((room) => {
      if (room) {
        // Todo This should check that there is no duplicate messageId with in this room and epoch, if there is, we need to return an error and reconstruct the secret from both messages, and ban the user
        addMessageToRoom(roomId, message)
          .then((roomToUpdate) => {
            console.log(roomToUpdate);
            return true;
          })
          .catch((error) => {
            console.error(`Error updating room: ${error}`);
            return false;
          });
      } else {
        console.log('Room not found');
        return false;
      }
    })
    .catch((error) => {
      console.error(`Error getting room: ${error}`);
      return false;
    });
  return false;
}

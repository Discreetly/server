import { getRoomByID } from './db';
import { PrismaClient } from '@prisma/client';
import { MessageI } from 'discreetly-interfaces';

const prisma = new PrismaClient();

function updateRoom(roomId: string, message: MessageI, epoch: number): Promise<unknown> {
  return prisma.rooms.update({
    where: {
      roomId: roomId
    },
    data: {
      epochs: {
        create: {
          epoch: epoch,
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

export function createMessage(roomId: string, message: MessageI) {
  getRoomByID(roomId)
    .then((room) => {
      if (room) {
        updateRoom(roomId, message)
          .then((roomToUpdate) => {
            console.log(roomToUpdate);
          })
          .catch((error) => {
            console.error(`Error updating room: ${error}`);
          });
      } else {
        console.log('Room not found');
      }
    })
    .catch((error) => {
      console.error(`Error getting room: ${error}`);
    });
}

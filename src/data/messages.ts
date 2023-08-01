import { getRoomByID } from './db';
import { PrismaClient } from '@prisma/client';
import { MessageI } from 'discreetly-interfaces';

const prisma = new PrismaClient();

function updateRoom(roomId: string, message: MessageI): Promise<any> {
  return prisma.rooms.update({
    where: {
      roomId: roomId
    },
    data: {
      epochs: {
        create: {
          epoch: +message.epoch.toString(),
          messages: {
            create: {
              message: message.message,
              messageId: message.messageId,
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

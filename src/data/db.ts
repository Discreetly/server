import { PrismaClient } from '@prisma/client';
import { RoomI } from 'discreetly-interfaces';

const prisma = new PrismaClient();

export function getRoomByID(id: string): RoomI | null {
  prisma.rooms
    .findUnique({
      where: {
        roomId: id
      }
    })
    .then((room) => {
      return room;
    })
    .catch((err) => console.error(err));
  return null;
}

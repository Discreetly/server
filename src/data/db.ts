/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { PrismaClient } from '@prisma/client';
import { RoomI, genId } from 'discreetly-interfaces';
import { serverConfig } from '../config/serverConfig';
import { genMockUsers, genClaimCodeArray } from '../utils';


const prisma = new PrismaClient();

interface CodeStatus {
  claimed: boolean;
  roomIds: string[];
}

interface ClaimCode {
  roomIds: string[];
}

export function getRoomByID(id: string): Promise<RoomI | null> | null {
  return prisma.rooms
    .findUnique({
      where: {
        roomId: id
      },
      select: {
        id: true,
        roomId: true,
        name: true,
        identities: true,
        rateLimit: true,
        userMessageLimit: true
      }
    })
    .then((room) => {
      return room;
    })
    .catch((err) => {
      console.error(err);
      throw err; // Add this line to throw the error
    });
}

export function getRoomsByIdentity(identity: string): RoomI[] {
  /* TODO Need to create a system here where the client needs to provide a
  proof they know the secrets to some Identity Commitment with a unix epoch
  time stamp to prevent replay attacks
  */
  prisma.rooms
    .findMany({
      where: {
        identities: {
          has: identity
        }
      }
    })
    .then((rooms) => {
      return rooms.map((room) => {
        room.roomId;
      });
    })
    .catch((err) => console.error(err));
  return [];
}

/**
 * Creates a new room with the given name and optional parameters.
 * @param {string} name - The name of the room.
 * @param {number} [rateLimit=1000] - The length of an epoch in milliseconds
 * @param {number} [userMessageLimit=1] - The message limit per user per epoch
 * @param {number} [numClaimCodes=0] - The number of claim codes to generate for the room.
 * @param {number} [approxNumMockUsers=20] - The approximate number of mock users to generate for the room.
 */
export async function createRoom(
  name: string,
  rateLimit: number = 1000,
  userMessageLimit: number = 1,
  numClaimCodes: number = 0,
  approxNumMockUsers: number = 20,
): Promise<boolean> {
  const claimCodes: { claimcode: string }[] = genClaimCodeArray(numClaimCodes);
  console.log(claimCodes);
  const mockUsers: string[] = genMockUsers(approxNumMockUsers);
  const roomData = {
    where: {
      roomId: genId(serverConfig.id, name).toString()
    },
    update: {},
    create: {
      roomId: genId(serverConfig.id, name).toString(),
      name: name,
      rateLimit: rateLimit,
      userMessageLimit: userMessageLimit,
      identities: mockUsers,
      claimCodes: {
        create: claimCodes
      }
    }
  };

  await prisma.rooms
    .upsert(roomData)
    .then(() => {
      return true;
    })
    .catch((err) => console.error(err));
  return false;
}

export function findClaimCode(code: string): Promise<CodeStatus | null> {
  return prisma.claimCodes.findUnique({
    where: { claimcode: code }
  });
}

export function updateClaimCode(code: string): Promise<ClaimCode> {
  return prisma.claimCodes.update({
    where: { claimcode: code },
    data: { claimed: true }
  });
}

export function updateRoomIdentities(idc: string, roomIds: string[]): Promise<unknown> {
  return prisma.rooms.updateMany({
    where: { id: { in: roomIds } },
    data: {
      identities: {
        push: idc
      }
    }
  });
}

export function findUpdatedRooms(roomIds: string[]): Promise<RoomI[]> {
  return prisma.rooms.findMany({
    where: { id: { in: roomIds } }
  });
}

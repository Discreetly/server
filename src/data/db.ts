/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { PrismaClient } from '@prisma/client';
import { genId } from 'discreetly-interfaces';
import type { RoomI } from 'discreetly-interfaces';
import { serverConfig } from '../config/serverConfig';
import { genMockUsers, genClaimCodeArray, pp } from '../utils';

const prisma = new PrismaClient();

interface CodeStatus {
  claimed: boolean;
  roomIds: string[];
}

interface RoomsFromClaimCode {
  roomIds: string[];
}

export async function getRoomByID(id: string): Promise<RoomI | null> {
  const room = await prisma.rooms
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
        userMessageLimit: true,
        membershipType: true,
        contractAddress: true,
        bandadaAddress: true,
        type: true
      }
    })
    .then((room) => {
      return room;
    })
    .catch((err) => {
      console.error(err);
      throw err; // Add this line to throw the error
    });
  return new Promise((resolve, reject) => {
    if (room) {
      resolve(room as RoomI);
    }
    reject('Room not found');
  });
}

export async function getRoomsByIdentity(identity: string): Promise<string[]> {
  /* TODO Need to create a system here where the client needs to provide a
  proof they know the secrets to some Identity Commitment with a unix epoch
  time stamp to prevent replay attacks

  https://github.com/Discreetly/IdentityCommitmentNullifierCircuit <- Circuit and JS to do this
  */
  const r: string[] = [];
  try {
    const rooms = await prisma.rooms.findMany({
      where: {
        identities: {
          has: identity
        }
      }
    });
    rooms.forEach((room) => {
      r.push(room.roomId);
    });
    console.log(r);
    return r;
  } catch (err) {
    console.error(err);
    return [];
  }
}

export function findClaimCode(code: string): Promise<CodeStatus | null> {
  return prisma.claimCodes.findUnique({
    where: { claimcode: code }
  });
}

export function updateClaimCode(code: string): Promise<RoomsFromClaimCode> {
  return prisma.claimCodes.update({
    where: { claimcode: code },
    data: { claimed: true }
  });
}

export function updateRoomIdentities(idc: string, roomIds: string[]): Promise<any> {
  return prisma.rooms
    .findMany({
      where: { id: { in: roomIds } }
    })
    .then((rooms) => {
      const roomsToUpdate = rooms
        .filter((room) => !room.identities.includes(idc))
        .map((room) => room.id);

      if (roomsToUpdate) {
        return prisma.rooms.updateMany({
          where: { id: { in: roomsToUpdate } },
          data: { identities: { push: idc } }
        });
      }
    })
    .catch((err) => {
      pp(err, 'error');
    });
}

export async function findUpdatedRooms(roomIds: string[]): Promise<RoomI[]> {
  const rooms = await prisma.rooms.findMany({
    where: { id: { in: roomIds } }
  });
  return new Promise((resolve, reject) => {
    if (rooms) {
      resolve(rooms as RoomI[]);
    }
    reject('No rooms found');
  });
}

export function createSystemMessages(message: string, roomId?: string): Promise<any> {
  const query = roomId ? { where: { roomId } } : undefined;
  return prisma.rooms.findMany(query)
    .then(rooms => {
      if (roomId && rooms.length === 0) {
        Promise.reject('Room not found')
      }
      const createMessages = rooms.map(room => {
        return prisma.messages.create({
          data: {
            message,
            roomId: room.roomId,
            messageId: "0",
            proof: JSON.stringify({}),
          },
        });
      });

      return Promise.all(createMessages);
    });
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
  rateLimit = 1000,
  userMessageLimit = 1,
  numClaimCodes = 0,
  approxNumMockUsers = 20,
  type: string = 'PUBLIC'
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
      type,
      claimCodes: {
        create: claimCodes
      }
    }
  }; 

  return await prisma.rooms
    .upsert(roomData)
    .then(() => {
      return true;
    })
    .catch((err) => {
      console.error(err);
      return false;
    });
}

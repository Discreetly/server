/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { PrismaClient } from '@prisma/client';
import { RoomI, genId } from 'discreetly-interfaces';
import { serverConfig } from '../config/serverConfig';
import { randn_bm } from '../utils';
import { generateClaimCodes } from 'discreetly-claimcodes';
import type { ClaimCodeT } from 'discreetly-claimcodes';

const prisma = new PrismaClient();

export function getRoomByID(id: string): Promise<RoomI> {
  return prisma.rooms
    .findUnique({
      where: {
        roomId: id
      }
    })
    .then((room) => {
      //TODO NEED TO FILTER OUT CLAIMCODE REFERENCES
      return room;
    })
    .catch((err) => {
      console.error(err);
      throw err; // Add this line to throw the error
    });
}

export function getRoomsByIdentity(identity: string): RoomI[] {
  // TODO Need to create a system here where the client needs to provide a proof they know the secrets to some Identity Commitment with a unix epoch time stamp to prevent replay attacks
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
export function createRoom(
  name: string,
  rateLimit: number = 1000,
  userMessageLimit: number = 1,
  numClaimCodes: number = 0,
  approxNumMockUsers: number = 20
): boolean {
  function genMockUsers(numMockUsers: number): string[] {
    // Generates random number of mock users between 0.5 x numMockusers and 2 x numMockUsers
    const newNumMockUsers = randn_bm(numMockUsers / 2, numMockUsers * 2);
    const mockUsers: string[] = [];
    for (let i = 0; i < newNumMockUsers; i++) {
      mockUsers.push(
        genId(
          serverConfig.id,
          // Generates a random string of length 10
          Math.random()
            .toString(36)
            .substring(2, 2 + 10) + i
        ).toString()
      );
    }
    return mockUsers;
  }

  function genClaimCodeArray(numClaimCodes: number): { claimcode: string }[] {
    const claimCodes = generateClaimCodes(numClaimCodes);
    const codeArr: { claimcode: string }[] = claimCodes.map((code: ClaimCodeT) => ({
      claimcode: code.code
    }));
    return codeArr;
  }

  const claimCodes: { claimcode: string }[] = genClaimCodeArray(numClaimCodes);
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

  prisma.rooms
    .upsert(roomData)
    .then(() => {
      return true;
    })
    .catch((err) => console.error(err));
  return false;
}

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { PrismaClient } from '@prisma/client';
import { genId } from 'discreetly-interfaces';
import type { RoomI } from 'discreetly-interfaces';
import { serverConfig } from '../config/serverConfig';
import { genMockUsers, genClaimCodeArray, pp } from '../utils';
import getRateCommitmentHash from '../crypto/rateCommitmentHasher';

const prisma = new PrismaClient();

interface CodeStatus {
  claimed: boolean;
  roomIds: string[];
}

interface RoomsFromClaimCode {
  roomIds: string[];
}

// Returns a room by it's roomId and the selected fields
export async function getRoomByID(id: string): Promise<RoomI | null> {
  const room = await prisma.rooms
    .findUnique({
      where: {
        roomId: id
      },
      // Filter out the information we want from the room
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
        bandadaGroupId: true,
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

// Function to fetch rooms by an identity commitment
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
        semaphoreIdentities: {
          has: identity
        }
      }
    });
    rooms.forEach((room) => {
      r.push(room.roomId);
    });
    return r;
  } catch (err) {
    console.error(err);
    return [];
  }
}

// Function to return a specific claim code
export function findClaimCode(code: string): Promise<CodeStatus | null> {
  return prisma.claimCodes.findUnique({
    where: { claimcode: code }
  });
}
// Function to claim a specific claim code
export function updateClaimCode(code: string): Promise<RoomsFromClaimCode> {
  return prisma.claimCodes.update({
    where: { claimcode: code },
    data: { claimed: true }
  });
}

// Helper function to make sure a rate commitment is a valid identity
function sanitizeIDC(idc: string): string {
  try {
    const tempBigInt = BigInt(idc);
    const tempString = tempBigInt.toString();
    if (idc === tempString) {
      return idc;
    } else {
      throw new Error('Invalid IDC provided.');
    }
  } catch (error) {
    throw new Error('Invalid IDC provided.');
  }
}

/* Function for '/join' endpoint to add identities to rooms
accounts for IDENTITY_LIST and BANDADA_GROUP rooms */
export async function updateRoomIdentities(
  idc: string,
  roomIds: string[]
): Promise<void> {
  const identityCommitment = sanitizeIDC(idc);
  return await prisma.rooms
    .findMany({
      where: { id: { in: roomIds } }
    })
    .then(async (rooms) => {
      await addIdentityToIdentityListRooms(rooms, identityCommitment);
      addIdentityToBandadaRooms(rooms, identityCommitment);
    })
    .catch((err) => {
      pp(err, 'error');
    });
}

// Helper function for updateRoomIdentities for IDENTITY_LIST rooms
function addIdentityToIdentityListRooms(
  rooms,
  identityCommitment: string
): unknown {
  const identityListRooms = rooms
    .filter(
      (room: RoomI) =>
      // check the membershipType is IDENTITY_LIST and that the identityCommitment is not already in the room
        room.membershipType === 'IDENTITY_LIST' &&
        !room.semaphoreIdentities?.includes(identityCommitment)
    )
    .map((room) => room.id as string);

  if (identityListRooms.length > 0) {
    for (const room of rooms) {
      return prisma.rooms
        .update({
          where: { id: room.id },
          data: {
            identities: {
              push: getRateCommitmentHash(
                BigInt(identityCommitment),
                BigInt((room.userMessageLimit as number) ?? 1)
              ).toString()
            },
            semaphoreIdentities: { push: identityCommitment }
          }
        })
        .then(() => {
          console.debug(
            `Successfully added user to Identity List room ${room.roomId}`
          );
        })
        .catch((err) => {
          console.error(err);
        });
    }
  }
}

// Helper function for updateRoomIdentities for BANDADA_GROUP rooms
function addIdentityToBandadaRooms(rooms, identityCommitment: string): void {
  const bandadaGroupRooms = rooms
    .filter(
      (room) =>
      // check the membershipType is BANDADA_GROUP and that the identityCommitment is not already in the room
        room.membershipType === 'BANDADA_GROUP' &&
        !room.semaphoreIdentities.includes(identityCommitment)
    )
    .map((room) => room as RoomI);

  if (bandadaGroupRooms.length > 0) {
    bandadaGroupRooms.forEach(async (room) => {
      const rateCommitment = getRateCommitmentHash(
        BigInt(identityCommitment),
        BigInt((room.userMessageLimit as number) ?? 1)
      ).toString()
      if (!room.bandadaAPIKey) {
        console.error('API key is missing for room:', room);
        return;
      }
      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': room.bandadaAPIKey
        }
      };
      await prisma.rooms.update({
        where: { id: room.id },
        data: {
          identities: {
            push: rateCommitment
          },
          semaphoreIdentities: { push: identityCommitment }
        }
      });
      const url = `https://${room.bandadaAddress}/groups/${room.bandadaGroupId}/members/${rateCommitment}`;
      fetch(url, requestOptions)
        .then((res) => {
          if (res.status == 200) {
            console.debug(
              `Successfully added user to Bandada group ${room.bandadaAddress}`
            );
          }
        })
        .catch((err) => {
          console.error(err);
        });
    });
  }
}

// Helper function for '/join' to return the rooms that have been updated
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


/* Function for '/admin/message' to send system messages across all rooms or a single room
skips proofing and rate limiting and is sent directly to rooms*/
export function createSystemMessages(
  message: string,
  roomId?: string
  ): Promise<unknown> {
  // TODO: Make interface for this return type; which is like a MessageI
  const query = roomId ? { where: { roomId } } : undefined;
  return prisma.rooms
    .findMany(query)
    .then((rooms) => {
      if (roomId && rooms.length === 0) {
        return Promise.reject('Room not found');
      }
      const createMessages = rooms.map((room) => {
        return prisma.messages.create({
          data: {
            message,
            roomId: room.roomId,
            messageId: '0',
            proof: JSON.stringify({})
          }
        });
      });

      return Promise.all(createMessages);
    })
    .catch((err) => {
      console.error(err);
      return Promise.reject(err);
    });
}

/* Function to 'remove' an identity from a room
sets the Rate Commitment and the Semaphore Identity
to 0n */
export function removeIdentityFromRoom(
  idc: string,
  room: RoomI
): Promise<void | RoomI> {
  const updateSemaphoreIdentities = room.semaphoreIdentities?.map((identity) =>
    identity === idc ? '0n' : identity as string
  ) ?? [];

  const rateCommitmentsToUpdate = getRateCommitmentHash(BigInt(idc), BigInt(room.userMessageLimit!)).toString()

  const updatedRateCommitments = room.identities?.map((limiter) =>
    limiter == rateCommitmentsToUpdate ? '0n' : limiter as string
  ) ?? []

  return prisma.rooms
    .update({
      where: { id: room.id },
      data: {
        identities: updatedRateCommitments,
        semaphoreIdentities: updateSemaphoreIdentities
      }
    })
    .then((room) => {
      return room as RoomI;
    })
    .catch((err) => {
      console.error(err);
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
  roomName: string,
  rateLimit = 1000,
  userMessageLimit = 1,
  numClaimCodes = 0,
  approxNumMockUsers = 20,
  type: string,
  bandadaAddress?: string,
  bandadaGroupId?: string,
  bandadaAPIKey?: string,
  membershipType?: string
): Promise<boolean> {
  const claimCodes: { claimcode: string }[] = genClaimCodeArray(numClaimCodes);
  const mockUsers: string[] = genMockUsers(approxNumMockUsers);
  const identityCommitments: string[] = mockUsers.map((user) =>
    getRateCommitmentHash(BigInt(user), BigInt(userMessageLimit)).toString()
  );
  const roomData = {
    where: {
      roomId: genId(serverConfig.id as bigint, roomName).toString()
    },
    update: {},
    create: {
      roomId: genId(serverConfig.id as bigint, roomName).toString(),
      name: roomName,
      rateLimit: rateLimit,
      userMessageLimit: userMessageLimit,
      semaphoreIdentities: mockUsers,
      identities: identityCommitments,
      type,
      bandadaAddress,
      bandadaGroupId,
      bandadaAPIKey,
      membershipType,
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

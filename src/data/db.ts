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

/**
 * Gets a room by id
 * @param {string} id The id of the room to get
 * @returns {Promise<RoomI | null>}The room, or null if it doesn't exist
 */

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

/* TODO Need to create a system here where the client needs to provide a
proof they know the secrets to some Identity Commitment with a unix epoch
time stamp to prevent replay attacks

https://github.com/Discreetly/IdentityCommitmentNullifierCircuit <- Circuit and JS to do this
*/

/**
 * This function takes in an identity and returns the rooms the identity is in.
 * @param identity - the identity of a user
 * @returns an array of roomIds
 */

export async function getRoomsByIdentity(identity: string): Promise<string[]> {
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


/**
 * Finds a claim code in the database.
 *
 * @param {string} code - The code to find.
 * @returns {Promise<CodeStatus | null>} - The claim code, if found.
 */

export function findClaimCode(code: string): Promise<CodeStatus | null> {
  return prisma.claimCodes.findUnique({
    where: { claimcode: code }
  });
}

/**
* Update the claim_code table to mark the given code as claimed.
* @param {string} code - The code to update
* @returns {Promise<RoomsFromClaimCode>} - The rooms associated with the claim code
*/

export function updateClaimCode(code: string): Promise<RoomsFromClaimCode> {
  return prisma.claimCodes.update({
    where: { claimcode: code },
    data: { claimed: true }
  });
}


/*
The sanitizeIDC function takes a string and returns a string.
The string is converted to a BigInt and then back to a string.
If the string has no loss of precision, it is returned.
Otherwise, an error is thrown.
*/

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

/**
* This code updates the identity commitments of a list of rooms.
* It adds the identity commitment to the identity list of each room,
* and also adds it to the bandada of each room. The identity commitment is
* sanitized before being added to the database.
* @param idc - The identity commitment of the user
* @param roomIds - The list of roomIds that the user is in
* @returns {Promise<void>} - A promise that resolves when the update is complete
*/

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

/**
 * Adds a user's identity commitment to the semaphoreIdentities list and adds their rate commitment to the identities list for each of the identity list rooms that they are in.
 * @param {rooms} - The list of rooms that the user is in
 * @param {string} identityCommitment - The user's identity commitment
 */
function addIdentityToIdentityListRooms(
  rooms,
  identityCommitment: string
): unknown {
  const identityListRooms = rooms
    .filter(
      (room: RoomI) =>
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



/**
 * This code adds a new identity commitment to the list of identities in a bandada room.
 * First we get the list of bandada rooms that contain the identity commitment.
 * Then we iterate over the list of rooms and add the identity commitment to each room.
 * After that we update the list of identities in each room in the database.
 * Finally, we send a POST request to the bandada server to add the identity to the group.
 * @param {RoomI[]} rooms - The list of rooms that contain the identity commitment.
 * @param {string} identityCommitment - The identity commitment to be added to the bandada room.
 * @return {void} Nothing.
 */
function addIdentityToBandadaRooms(rooms, identityCommitment: string): void {
  const bandadaGroupRooms = rooms
    .filter(
      (room) =>
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

/**
* This function is used to find rooms that have been updated
* It is used in the findUpdatedRooms function
* It is important because it allows the user to see which rooms have been updated
* @param {string[]} roomIds - The list of roomIds that the user is in
* @returns {Promise<RoomI[]>} - A promise that resolves to a list of rooms
*/

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


/**
* This function creates a system message in a room.
* The message will be the same in all rooms if no roomId is passed.
* If a roomId is passed, the message will be created in that room.
* @param {string} message - The message to be created
* @param {string} roomId - The roomId to create the message in
*/
export function createSystemMessages(
  message: string,
  roomId?: string
  ): Promise<unknown> {

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

/**
* This function takes in an identity and a room and removes the identity from the room
* by setting its semaphoreIdentities to 0n and identities to 0n
* @param {string} idc - The identity of the user
* @param {RoomI} room - The room to remove the identity from
* @returns {Promise<void | RoomI>} - A promise that resolves to the room
*/

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
 * @param {string} [type='IDENTITY_LIST'] - The type of room to create.
 * @param {string} [bandadaAddress] - The address of the bandada server.
 * @param {string} [bandadaGroupId] - The id of the bandada group.
 * @param {string} [bandadaAPIKey] - The API key for the bandada server.
 * @param {string} [membershipType] - The membership type of the room.
 * @returns {Promise<boolean>} - A promise that resolves to true if the room was created successfully.
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

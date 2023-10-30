import { PrismaClient } from '@prisma/client';
import { MessageI, RoomI } from 'discreetly-interfaces';
import { ClaimCodeI, GateWayIdentityI } from '../../types/';
const prisma = new PrismaClient();

/**
 * Gets a room by id
 * @param {string} id The id of the room to get
 * @returns {Promise<RoomI | null>}The room, or null if it doesn't exist
 */
export async function findRoomById(id: string): Promise<RoomI | null> {
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
        type: true,
        ephemeral: true,
        encrypted: true
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
 * @param {string[]} identity - the identity of a user
 * @returns an array of roomIds
 */
export async function findRoomsByIdentity(identity: string): Promise<string[]> {
  const r: string[] = [];
  try {
    const gateway = await prisma.gateWayIdentity.findFirst({
      where: {
        semaphoreIdentity: identity
      },
      include: {
        rooms: true
      }
    });
    if (!gateway) {
      return [];
    }
    gateway.rooms.forEach((room) => {
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
 * @returns {Promise<ClaimCodeI | null>} - The claim code, if found.
 */
export async function findClaimCode(code: string): Promise<ClaimCodeI | null> {
  return await prisma.claimCodes.findUnique({
    where: { claimcode: code }
  });
}

/**
 * Finds a gateway identity in the database.
 * @param {string} identity - The identity to find
 * @returns
 */
export async function findGatewayByIdentity(
  identity: string
): Promise<GateWayIdentityI | null> {
  return await prisma.gateWayIdentity.findFirst({
    where: {
      semaphoreIdentity: identity
    }
  });
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
    where: { roomId: { in: roomIds } }
  });
  return new Promise((resolve, reject) => {
    if (rooms) {
      resolve(rooms as RoomI[]);
    }
    reject('No rooms found');
  });
}

/**
 * This function is used to find a room in the database using a message and the roomId and returns the room
 * @param {string} roomId - The id of the room to find
 * @param {MessageI} message - The id of message to find
 * @returns
 */
export async function findRoomWithMessageId(
  roomId: string,
  message: MessageI
): Promise<MessageI | null> {
  try {
    const room = await prisma.rooms.findFirst({
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
    });
    if (!room) {
      console.debug('Room not found');
      return null;
    }
    if (room.epochs[0]) {
      return room.epochs[0].messages[0] as MessageI;
    } else {
      console.debug('Epoch not found');
      return null;
    }
  } catch (err) {
    console.error(err);
    throw err;
  }
}

/**
 * This function is used to find groups in the database that the ethereum address is in
 * @param {string} group - The type of the group to find
 * @param {string} group - The address of the group to find
 * @returns
 */
export function findManyGroups(
  group: string,
  address?: string
) {
  switch (group) {
    case 'ethereum':
      if (address) {
        return prisma.ethereumGroup.findMany({
          where: {
            ethereumAddresses: {
              has: address
            }
          },
          select: {
            name: true
          }
        });
      } else {
        return prisma.ethereumGroup.findMany({
          select: {
            name: true
          }
        });
      }
    case 'jubmoji':
      if (address) {
        return prisma.jubmojiGroup.findMany({
          where: {
            jubmojiAddresses: {
              has: address
            }
          },
          select: {
            name: true
          }
        });
      } else {
        return prisma.jubmojiGroup.findMany({
          select: {
            name: true
          }
        });
      }
      default:
        throw new Error('Invalid group');
  }
}

/**
 * This function is used to find a group in the database and returns the groups ethereum addresses
 * @param {string} name - The name of the group to find
 * @returns {Promise<{ ethereumAddresses: string[] } | null>} - A promise that resolves to the group
 */
export function findUniqueEthGroup(
  name: string
): Promise<{ ethereumAddresses: string[] } | null> {
  return prisma.ethereumGroup.findUnique({
    where: {
      name: name
    },
    select: {
      ethereumAddresses: true
    }
  });
}

/**
 * This function is used to find messages in a room
 * @param {string} roomId - The id of the room to find messages in
 * @returns {void}
 */
export function findMessages(roomId : string) {
  return prisma.messages
    .findMany({
      take: 500,
      orderBy: {
        timeStamp: 'desc'
      },
      where: {
        roomId: roomId
      },
      select: {
        id: false,
        message: true,
        messageId: true,
        proof: true,
        roomId: true,
        timeStamp: true
      }
    })
}

import { PrismaClient } from '@prisma/client';
import { MessageI, RoomI } from 'discreetly-interfaces';
import { ClaimCodeI, GateWayIdentityI, Jubmojis } from '../../types/';
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
 * @param identity - the identity of a user
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
 * This function finds a gateway identity in the database
 * @param {string} identity - The identity of the user to find
 * @returns {Promise<GateWayIdentityI | null>} - The gateway identity, if found
 */
export async function findGatewayByIdentity(identity: string): Promise<GateWayIdentityI | null> {
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
 * This function finds a room with a message id
 * @param {string} roomId - The id of the room to find
 * @param {MessageI} message - The message id to find
 * @returns {Promise<MessageI | null>} - A promise that resolves to a message
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
 * This function finds all the used jubmoji nullifiers in the db
 * @returns {Promise<string[]>} - A promise that resolves to a list of used sig nullifiers
 */
export async function findAllJubmojiNullifiers(): Promise<string[]> {
  const jubmojiNullifiers: Jubmojis[] = await prisma.gateWayIdentity.findMany({
    select: {
      jubmoji: true
    }
  })
  const usedSigNullifiers: string[] = [];

  jubmojiNullifiers.forEach((nullifier) => {
    usedSigNullifiers.push(...nullifier.jubmoji as string[]);
  });
  return usedSigNullifiers
}

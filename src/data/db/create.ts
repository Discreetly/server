import { PrismaClient } from '@prisma/client';
import {
  getRateCommitmentHash,
  MessageI,
  randomBigInt
} from 'discreetly-interfaces';
import { genClaimCodeArray, genMockUsers } from '../../utils';
import type { Server as SocketIOServer } from 'socket.io';
import { EthGroupI } from '../../types';

const prisma = new PrismaClient();

/**
 * Creates a new room with the given name and optional parameters.
 * @param {string} name - The name of the room.
 * @param {number} [rateLimit=10000] - The length of an epoch in milliseconds
 * @param {number} [userMessageLimit=12] - The message limit per user per epoch
 * @param {number} [numClaimCodes=0] - The number of claim codes to generate for the room.
 * @param {number} [approxNumMockUsers=5] - The approximate number of mock users to generate for the room.
 * @param {string} [type='IDENTITY_LIST'] - The type of room to create.
 * @param {string[]} [adminIdentities=[]] - The identities of the admins of the room.
 * @param {string} [bandadaAddress] - The address of the bandada server.
 * @param {string} [bandadaGroupId] - The id of the bandada group.
 * @param {string} [bandadaAPIKey] - The API key for the bandada server.
 * @param {string} [membershipType] - The membership type of the room.
 * @param {string} [roomId] - The ID of the room to create.
 * @returns {Promise<boolean>} - A promise that resolves to true if the room was created successfully.
 */
export async function createRoom(
  roomName: string,
  rateLimit = 100000,
  userMessageLimit = 12,
  numClaimCodes = 0,
  approxNumMockUsers = 5,
  type: string,
  adminIdentities?: string[],
  bandadaAddress?: string,
  bandadaGroupId?: string,
  bandadaAPIKey?: string,
  membershipType?: string,
  roomId?: string
): Promise<
  { roomId: string; claimCodes: { claimcode: string }[] } | undefined | null
> {
  const claimCodes: { claimcode: string }[] = genClaimCodeArray(numClaimCodes);
  const mockUsers: string[] = genMockUsers(approxNumMockUsers);
  const identityCommitments: string[] = mockUsers.map((user) =>
    getRateCommitmentHash(BigInt(user), BigInt(userMessageLimit)).toString()
  );
  const _roomId = roomId ? roomId : randomBigInt().toString();

  const room = await prisma.rooms.findUnique({ where: { roomId: _roomId } });
  if (room) return null;

  const roomData = {
    where: {
      roomId: _roomId
    },
    update: {},
    create: {
      roomId: _roomId,
      name: roomName,
      banRateLimit: rateLimit,
      userMessageLimit: userMessageLimit,
      adminIdentities: adminIdentities,
      identities: identityCommitments,
      bandadaAddress,
      bandadaGroupId,
      bandadaAPIKey,
      type,
      membershipType,
      claimCodes: {
        create: claimCodes
      },
      gateways: {
        create: mockUsers.map((user) => ({
          semaphoreIdentity: user
        }))
      }
    }
  };

  return await prisma.rooms
    .upsert(roomData)
    .then(() => {
      return { roomId: _roomId, claimCodes };
    })
    .catch((err) => {
      console.error(err);
      return undefined;
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
  roomId?: string,
  io?: SocketIOServer
): Promise<unknown> {
  const query = roomId ? { where: { roomId } } : undefined;
  return prisma.rooms
    .findMany(query)
    .then((rooms) => {
      if (roomId && rooms.length === 0) {
        return Promise.reject('Room not found');
      }
      const createMessagePromises = rooms.map((room) => {
        const createMessage = prisma.messages.create({
          data: {
            message,
            roomId: room.roomId,
            messageId: '0',
            proof: JSON.stringify({})
          }
        });
        if (io) {
          io.to(room.roomId).emit('systemMessage', createMessage);
        }
        return createMessage;
      });

      return Promise.all(createMessagePromises);
    })
    .catch((err) => {
      console.error(err);
      return Promise.reject(err);
    });
}

/**
 * Adds a message to a room.
 * @param {string} roomId - The ID of the room to add the message to.
 * @param {MessageI} message - The message to add to the room.
 * @returns {Promise<unknown>} - A promise that resolves when the message has been added to the room.
 */
export function createMessageInRoom(
  roomId: string,
  message: MessageI
): Promise<unknown> {
  if (!message.epoch) {
    throw new Error('Epoch not provided');
  }
  return prisma.rooms.update({
    where: {
      roomId: roomId
    },
    data: {
      epochs: {
        create: {
          epoch: String(message.epoch),
          messages: {
            create: {
              message: message.message ? String(message.message) : '',
              messageId: message.messageId ? message.messageId.toString() : '',
              messageType: message.messageType,
              proof: JSON.stringify(message.proof),
              roomId: roomId
            }
          }
        }
      }
    }
  });
}

export function createEthGroup(
  name: string,
  roomIds: string[]
): Promise<EthGroupI> {
  return prisma.ethereumGroup.create({
    data: {
      name: name,
      rooms: {
        connect: roomIds.map((roomId) => ({ roomId }))
      }
    }
  });
}

export function createClaimCode(
  claimCode: string,
  roomIds: string[],
  expiresAt: number,
  usesLeft: number,
  discordId: string,
  roomId?: string
  ) {
  if (!roomId) {
    return prisma.claimCodes.create({
      data: {
        claimcode: claimCode,
        roomIds: roomIds,
        expiresAt: expiresAt,
        usesLeft: usesLeft,
        discordId: discordId
      }
    });
  } else {
    return prisma.claimCodes.create({
      data: {
        claimcode: claimCode,
        roomIds: roomIds,
        expiresAt: expiresAt,
        usesLeft: usesLeft,
        discordId: discordId,
        rooms: {
          connect: {
            roomId: roomId
          }
        }
      }
    });
  }
}


export async function joinRoomsFromEthAddress(
  recoveredAddress: string,
  message: string
) {
  const gatewayIdentity = await prisma.gateWayIdentity.upsert({
    where: { semaphoreIdentity: message },
    update: {},
    create: {
      semaphoreIdentity: message
    }
  });
  await prisma.ethereumAddress.upsert({
    where: { ethereumAddress: recoveredAddress },
    update: {},
    create: {
      ethereumAddress: recoveredAddress,
      gatewayId: gatewayIdentity.id
    }
  });
  const roomsToJoin = await prisma.ethereumGroup.findMany({
    where: {
      ethereumAddresses: {
        has: recoveredAddress
      }
    },
    select: {
      roomIds: true
    }
  });
  const roomIdsSet = new Set(roomsToJoin.map((room) => room.roomIds).flat());
  const roomIds = Array.from(roomIdsSet);

  await prisma.gateWayIdentity.update({
    where: { id: gatewayIdentity.id },
    data: { roomIds: { set: roomIds } }
  });

  return roomIds;
}

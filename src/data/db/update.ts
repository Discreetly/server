import { PrismaClient } from '@prisma/client';
import { sanitizeIDC } from '../utils';
import { findClaimCode, findGatewayByIdentity } from './find';
import { RoomI } from 'discreetly-interfaces';
import { getRateCommitmentHash } from '../../crypto';
import { pp } from '../../utils';
import { RoomWithSecretsI, ClaimCodeI } from '../../types/';

const prisma = new PrismaClient();

/**
 * This code updates the identity commitments of a list of rooms.
 * It adds the identity commitment to the identity list of each room,
 * and also adds it to the bandada of each room. The identity commitment is
 * sanitized before being added to the database.
 * @param {string} idc - The identity commitment of the user
 * @param {string[]} roomIds - The list of roomIds that the user is in
 * @returns {Promise<void>} - A promise that resolves when the update is complete
 */
export async function updateRoomIdentities(
  idc: string,
  roomIds: string[],
  discordId?: string
): Promise<string[]> {
  try {
    const identityCommitment: string = sanitizeIDC(idc);
    const rooms: RoomWithSecretsI[] | null = (await prisma.rooms.findMany({
      where: { id: { in: roomIds } }
    })) as RoomWithSecretsI[];

    if (!rooms) {
      throw new Error('No rooms found with the provided IDs');
    }

    const identityRooms: string[] = await addIdentityToIdentityListRooms(
      rooms,
      identityCommitment,
      discordId
    );
    const bandadaRooms: string[] = await addIdentityToBandadaRooms(
      rooms,
      identityCommitment,
      discordId
    );

    return [...identityRooms, ...bandadaRooms];
  } catch (err) {
    pp(err, 'error');
    throw err;
  }
}

/**
 * This function looks up a claim code and updates its usesLeft field.
 * If the claim code is not found, then it returns undefined.
 * Otherwise it returns a ClaimCodeI object.
 * @param {string} code - The claim code to update
 * @param {string} idc - The identity of the user
 * @returns {Promise<ClaimCodeI | void>} - A promise that resolves to a ClaimCodeI object
 */
export async function updateClaimCode(
  code: string,
  idc: string
): Promise<ClaimCodeI | void> {
  const claimCode = await findClaimCode(code);
  if (!claimCode) {
    return;
  } else {
    const newUsesLeft =
      claimCode.usesLeft === -1 ? claimCode.usesLeft : claimCode.usesLeft - 1;

    const gateway = await findGatewayByIdentity(idc);
    if (gateway) {
      return await prisma.claimCodes.update({
        where: { claimcode: code },
        data: {
          usesLeft: newUsesLeft,
          gateways: {
            connect: {
              semaphoreIdentity: idc
            }
          }
        }
      });
    } else {
      return await prisma.claimCodes.update({
        where: { claimcode: code },
        data: {
          usesLeft: newUsesLeft,
          gateways: {
            create: {
              semaphoreIdentity: idc
            }
          }
        }
      });
    }
  }
}

/**
 * Adds a user's identity commitment to the semaphoreIdentities list and adds their rate commitment to the identities list for each of the identity list rooms that they are in.
 * @param {rooms} - The list of rooms that the user is in
 * @param {string} identityCommitment - The user's identity commitment
 * @param {string} discordId - The user's discord ID
 * @return {string[]} addedRooms - The list of rooms that the user was added to
 */
export async function addIdentityToIdentityListRooms(
  rooms: RoomI[] | RoomWithSecretsI[],
  identityCommitment: string,
  discordId?: string
): Promise<string[]> {
  const identityListRooms = rooms
    .filter(
      (room: RoomI) =>
        room.membershipType === 'IDENTITY_LIST' &&
        !room.identities?.includes(
          getRateCommitmentHash(
            BigInt(identityCommitment),
            BigInt(room.userMessageLimit! ?? 1)
          ).toString()
        )
    )
    .map((room) => room.roomId as string);

  const addedRooms: string[] = [];

  for (const roomId of identityListRooms) {
    const room = rooms.find((r) => r.roomId === roomId);
    if (room) {
      try {
        const gateway = await findGatewayByIdentity(identityCommitment);
        if (gateway) {
          await prisma.rooms.update({
            where: { roomId: roomId },
            data: {
              identities: {
                push: getRateCommitmentHash(
                  BigInt(identityCommitment),
                  BigInt(room.userMessageLimit! ?? 1)
                ).toString()
              },
              gateways: {
                connect: {
                  semaphoreIdentity: identityCommitment
                }
              }
            }
          });
          if (discordId) {
            await prisma.gateWayIdentity.update({
              where: { semaphoreIdentity: identityCommitment },
              data: {
                discordId: discordId
              }
            });
          }
          console.debug(
            `Successfully added user to Identity List room ${room.roomId}`
          );
          addedRooms.push(roomId);
        } else {
          await prisma.rooms.update({
            where: { roomId: roomId },
            data: {
              identities: {
                push: getRateCommitmentHash(
                  BigInt(identityCommitment),
                  BigInt(room.userMessageLimit! ?? 1)
                ).toString()
              },
              gateways: {
                create: {
                  semaphoreIdentity: identityCommitment,
                  discordId: discordId
                }
              }
            }
          });
          console.debug(
            `Successfully created and added user to Identity List room ${room.roomId}`
          );
          addedRooms.push(roomId);
        }
      } catch (err) {
        console.error(err);
      }
    }
  }
  return addedRooms;
}

/**
 * This code adds a new identity commitment to the list of identities in a bandada room.
 * First we get the list of bandada rooms that contain the identity commitment.
 * Then we iterate over the list of rooms and add the identity commitment to each room.
 * After that we update the list of identities in each room in the database.
 * Finally, we send a POST request to the bandada server to add the identity to the group.
 * @param {RoomI[]} rooms - The list of rooms that contain the identity commitment.
 * @param {string} identityCommitment - The identity commitment to be added to the bandada room.
 * @return {string[]} addedRooms - The list of rooms that the user was added to
 */
export async function addIdentityToBandadaRooms(
  rooms: RoomWithSecretsI[],
  identityCommitment: string,
  discordId?: string
): Promise<string[]> {
  const bandadaGroupRooms = rooms
    .filter(
      (room: RoomI) =>
        room.membershipType === 'BANDADA_GROUP' &&
        !room.identities?.includes(
          getRateCommitmentHash(
            BigInt(identityCommitment),
            BigInt(room.userMessageLimit! ?? 1)
          ).toString()
        )
    )
    .map((room) => room);

  const addedRooms: string[] = [];

  if (bandadaGroupRooms.length > 0) {
    const promises = bandadaGroupRooms.map(async (room) => {
      const rateCommitment = getRateCommitmentHash(
        BigInt(identityCommitment),
        BigInt(room.userMessageLimit! ?? 1)
      ).toString();

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

      try {
        const gateway = await findGatewayByIdentity(identityCommitment);
        if (gateway) {
          await prisma.rooms.update({
            where: { id: room.id },
            data: {
              identities: {
                push: rateCommitment
              },
              gateways: {
                connect: {
                  semaphoreIdentity: identityCommitment
                }
              }
            }
          });
          await prisma.gateWayIdentity.update({
            where: { semaphoreIdentity: identityCommitment },
            data: {
              discordId: discordId
            }
          });
        } else {
          await prisma.rooms.update({
            where: { id: room.id },
            data: {
              identities: {
                push: rateCommitment
              },
              gateways: {
                create: {
                  semaphoreIdentity: identityCommitment,
                  discordId: discordId
                }
              }
            }
          });
        }

        const url = `https://${room.bandadaAddress}/groups/${room.bandadaGroupId}/members/${rateCommitment}`;
        const response = await fetch(url, requestOptions);
        if (response.status == 201) {
          console.debug(
            `Successfully added user to Bandada group ${room.bandadaAddress}`
          );
          addedRooms.push(room.id);
        }
      } catch (err) {
        console.error(err);
      }
    });

    await Promise.all(promises);
  }

  return addedRooms;
}

/** Creates a new Ethereum group for a room.
 * @param {string} name - The name of the group
 * @param {string} roomId - The ID of the room
 * @param {string[]} ethAddresses - The list of Ethereum addresses to add to the group
*/

export async function createEthGroup(
  name: string,
  roomId: string,
  ethAddresses: string[]
) {
  await prisma.rooms.update({
    where: {
      roomId: roomId
    },
    data: {
      ethereumGroups: {
        create: {
          name: name,
          ethereumAddresses: {
            set: ethAddresses
          }
        }
      }
    }
  });
}

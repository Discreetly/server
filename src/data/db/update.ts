import { PrismaClient } from '@prisma/client';
import { sanitizeIDC } from '../utils';
import { findClaimCode, findGatewayByIdentity } from './find';
import { RoomI } from 'discreetly-interfaces';
import { getRateCommitmentHash } from '../../crypto';
import { pp } from '../../utils';
import { RoomWithSecretsI, ClaimCodeI } from '../../types/';
import { IDCProof } from 'idc-nullifier';

const prisma = new PrismaClient();

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
export async function createEthGroupForRoom(
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


/**
 *
 * @param {string[]} names - The names of the ethereum groups to add the addresses to
 * @param {string[]} ethAddresses - An array of ethereum addresses to add to the groups
 * @returns
 */
export function addAddressesToEthGroup(names: string[], ethAddresses: string[]) {
  return prisma.ethereumGroup.updateMany({
    where: {
      name: {
        in: names
      }
    },
    data: {
      ethereumAddresses: {
        push: ethAddresses
      }
    }
  });
}

/**
 * This function updates an ethereum group in the database.
 * @param {string} name - The name of the ethereum group to update
 * @param {string[]} ethAddresses - An array of ethereum addresses to add to the group
 * @param {string[]} roomIds - The ids of the rooms to connect to the group
 * @returns
 */
export function updateEthGroup(name: string, ethAddresses: string[], roomIds: string[]) {
  return prisma.ethereumGroup.update({
    where: {
      name: name
    },
    data: {
      ethereumAddresses: {
        push: ethAddresses
      },
      rooms: {
        connect: roomIds.map((roomId) => ({ roomId }))
      }
    }
  });
}

/**
 * Updates a room's claim code list.
 * @param {string} roomId - The id of the room to update
 * @param {string} claimCodeId - The id of the claim code to add to the room
 * @returns
 */
export function updateRoomClaimCodes(roomId: string, claimCodeId: string) {
  return prisma.rooms.update({
    where: {
      roomId: roomId
    },
    data: {
      claimCodeIds: {
        push: claimCodeId
      }
    }
  });
}

/**
 * Updates a users identity commitment in the database.
 * @param {IDCProof} generatedProof - Proof generated by the user
 * @returns
 */
export async function updateIdentites(generatedProof: IDCProof) {
  return await prisma.gateWayIdentity.update({
    where: {
      semaphoreIdentity: String(generatedProof.publicSignals.identityCommitment)
    },
    data: {
      semaphoreIdentity: String(generatedProof.publicSignals.externalNullifier),
    }
  })
}

/**
 * Adds an admin to a room.
 * @param {string} roomId - The id of the room to add the admin to
 * @param {string} idc - The identity of the admin
 * @returns
 */
export async function addAdminToRoom(roomId: string, idc: string) {
  return await prisma.rooms.update({
    where: {
      roomId: roomId
    },
    data: {
      adminIdentities: {
        push: idc
      }
    }
  });
}

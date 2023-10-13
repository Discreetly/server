import { PrismaClient } from '@prisma/client';
import { sanitizeIDC } from '../utils';
import { findClaimCode } from './find';
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
 * @param idc - The identity commitment of the user
 * @param roomIds - The list of roomIds that the user is in
 * @returns {Promise<void>} - A promise that resolves when the update is complete
 */
export async function updateRoomIdentities(
  idc: string,
  roomIds: string[]
): Promise<string[] | void> {
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
      identityCommitment
    );
    const bandadaRooms: string[] = await addIdentityToBandadaRooms(
      rooms,
      identityCommitment
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
 * @returns {Promise<ClaimCodeI | void>} - A promise that resolves to a ClaimCodeI object
 */
export async function updateClaimCode(
  code: string
): Promise<ClaimCodeI | void> {
  const claimCode = await findClaimCode(code);
  if (!claimCode) {
    return;
  } else {
    const newUsesLeft =
      claimCode.usesLeft === -1 ? claimCode.usesLeft : claimCode.usesLeft - 1;
    return await prisma.claimCodes.update({
      where: { claimcode: code },
      data: {
        usesLeft: newUsesLeft
      }
    });
  }
}

/**
 * Adds a user's identity commitment to the semaphoreIdentities list and adds their rate commitment to the identities list for each of the identity list rooms that they are in.
 * @param {rooms} - The list of rooms that the user is in
 * @param {string} identityCommitment - The user's identity commitment
 * @return {string[]} addedRooms - The list of rooms that the user was added to
 */
export async function addIdentityToIdentityListRooms(
  rooms: RoomI[] | RoomWithSecretsI[],
  identityCommitment: string
): Promise<string[]> {
  const identityListRooms = rooms
    .filter(
      (room: RoomI) =>
        room.membershipType === 'IDENTITY_LIST'
    )
    .map((room) => room.roomId as string);

  const addedRooms: string[] = [];

  for(const roomId of identityListRooms) {
    const room = rooms.find((r) => r.roomId === roomId);
    if (room) {
      try {
        const gateway = await prisma.gateWayIdentity.findUnique({
          where: {
            semaphoreIdentity: identityCommitment
          }
        });
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
          console.debug(`Successfully added user to Identity List room ${room.roomId}`);
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
                  discordId: '',
                  steamId64: ''
                }
              }
            }
          })
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
  identityCommitment: string
): Promise<string[]> {
  const bandadaGroupRooms = rooms
    .filter(
      (room: RoomI) =>
        room.membershipType === 'BANDADA_GROUP'
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
        const gateway = await prisma.gateWayIdentity.findUnique({
          where: {
            semaphoreIdentity: identityCommitment
          }
        });

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
                  discordId: '',
                  steamId64: '',
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

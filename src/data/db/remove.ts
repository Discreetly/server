import { PrismaClient } from '@prisma/client';
import { RoomI, getRateCommitmentHash } from 'discreetly-interfaces';
const prisma = new PrismaClient();

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

  const rateCommitmentsToUpdate = getRateCommitmentHash(
    BigInt(idc),
    BigInt(room.userMessageLimit!)
  ).toString();

  const updatedRateCommitments =
    room.identities?.map((limiter) =>
      limiter == rateCommitmentsToUpdate ? '0' : (limiter as string)
    ) ?? [];

  return prisma.rooms
    .update({
      where: { id: room.id },
      data: {
        identities: updatedRateCommitments,
        gateways: {
          disconnect: {
            semaphoreIdentity: idc
          }
        }
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
 * This code removes a room from the database. It also removes any messages associated with that room.
 * @param {string} roomId - The id of the room to remove
 * @returns {Promise<boolean>} - A promise that resolves to true if the room was removed and false otherwise
 * */

export function removeRoom(roomId: string): Promise<boolean> {
  return prisma.messages
    .deleteMany({
      where: {
        roomId: roomId
      }
    })
    .then(() => {
      return prisma.rooms
        .delete({
          where: {
            roomId: roomId
          }
        })
        .then(() => true)
        .catch((err) => {
          console.error(err);
          return false;
        });
    })
    .catch((err) => {
      console.error(err);
      return false;
    });
}

/**
 * This function removes a message from the database. It takes in a roomId and a messageId, and uses them to find the message in the database. It then deletes the message from the database and returns true if the message was successfully deleted. If there is an error, it will return false.
 * @param {string} roomId - The id of the room the message is in
 * @param {string} messageId - The id of the message to remove
 * @returns {Promise<boolean>} - A promise that resolves to true if the message was removed and false otherwise
*/

export function removeMessage(roomId: string, messageId: string) {
  return prisma.messages
    .deleteMany({
      where: {
        roomId: roomId,
        messageId: messageId
      }
    })
    .then(() => {
      return true;
    })
    .catch((err) => {
      console.error(err);
      return false;
    });
}

import express from 'express';
import type { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import basicAuth from 'express-basic-auth';
import { PrismaClient } from '@prisma/client';
import { genClaimCodeArray, pp } from '../../utils';
import { IDCProof } from 'idc-nullifier/dist/types/types';
import { verifyIdentityProof } from '../../crypto/idcVerifier/verifier';
import { limiter } from '../middleware';
import { createSystemMessages } from '../../data/db';

const prisma = new PrismaClient();
const router = express.Router();

const adminPassword = process.env.PASSWORD ? process.env.PASSWORD : 'password';

const adminAuth = basicAuth({
  users: {
    admin: adminPassword
  }
});

/**
 * Endpoint to add claim codes to all rooms or a subset of rooms
 * This code adds claim codes to the database.
 * It is used by the admin panel to create claim codes.
 * It takes in the number of codes to create, the rooms to add them to,
 * and whether to add them to all rooms or just the selected ones.
 * It generates the codes, then creates the ClaimCode objects in the database.
 * The codes are added to the specified rooms, and are not claimed.
 * @param {number} numCodes - The number of codes to add to the room
 * @param {string[]} rooms - The ids of the rooms to add codes to
 * @param {boolean} all - Whether to add codes to all rooms or just the selected ones
 * @param {number} expiresAt - The date the codes expire - if not specified, defaults to 3 months from now
 * @param {number} usesLeft - The number of uses left for the codes - if not specified, defaults to -1 (unlimited)
 * @param {string} discordId - The discord id of the user who created the codes
 * @returns {void}
 * @example {
 *          "numCodes": number,
 *          "rooms": string[],
 *          "all": boolean,
 *          "expiresAt": number, // optional
 *          "usesLeft": number   // optional
 *          "discordId": string // optional
 *          }
 */
router.post(
  '/addcode',
  adminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { numCodes, rooms, all, expiresAt, usesLeft, discordId } = req.body as {
      numCodes: number;
      rooms: string[];
      all: boolean;
      expiresAt: number;
      usesLeft: number;
      discordId: string;
    };

    const currentDate = new Date();
    const threeMonthsLater = new Date(currentDate).setMonth(currentDate.getMonth() + 3);

    const codeExpires = expiresAt ? expiresAt : threeMonthsLater;
    const query = all ? undefined : { where: { roomId: { in: rooms } } };

    const codes = genClaimCodeArray(numCodes);
    return await prisma.rooms.findMany(query).then((rooms) => {
      const roomIds = rooms.map((room) => room.id);
      const createCodes = codes.map((code) => {
        return prisma.claimCodes
          .create({
            data: {
              claimcode: code.claimcode,
              roomIds: roomIds,
              expiresAt: codeExpires,
              usesLeft: usesLeft,
              discordId: discordId
            }
          })
          .then((newCode) => {
            const updatePromises = rooms.map((room) => {
              return prisma.rooms.update({
                where: {
                  roomId: room.roomId
                },
                data: {
                  claimCodeIds: {
                    push: newCode.id
                  }
                }
              });
            });
            return Promise.all(updatePromises);
          })
          .catch((err) => {
            console.error(err);
            res.status(500).json({ error: 'Internal Server Error' });
          });
      });

      return Promise.all(createCodes)
        .then(() => {
          res.status(200).json({ message: 'Claim codes added successfully', codes });
        })
        .catch((err) => {
          console.error(err);
          res.status(500).json({ error: 'Internal Server Error' });
        });
    });
  })
);

/**
 * Adds claim codes to a room
 *
 * @param {number} numCodes The number of codes to add to the room
 * @param {number} expires The date the codes expire - if not specified, defaults to 3 months from now
 * @param {number} usesLeft The number of uses left for the codes - if not specified, defaults to -1 (unlimited)
 * @param {string} roomId The id of the room to add codes to
 * @returns {void}
 * @example {
 *          "numCodes": number
 *          }
 */
router.post('/:roomId/addcode', adminAuth, (req, res) => {
  const { roomId } = req.params;
  const { numCodes, expires, usesLeft } = req.body as {
    numCodes: number;
    expires: number;
    usesLeft: number;
  };
  const codes = genClaimCodeArray(numCodes);

  const currentDate = new Date();
  const threeMonthsLater = new Date(currentDate).setMonth(currentDate.getMonth() + 3);

  const codeExpires = expires ? expires : threeMonthsLater;

  prisma.rooms
    .findUnique({
      where: { roomId: roomId },
      include: { claimCodes: true }
    })
    .then((room) => {
      if (!room) {
        res.status(404).json({ error: 'Room not found' });
        return;
      }
      // Map over the codes array and create a claim code for each code
      const createCodes = codes.map((code) => {
        return prisma.claimCodes.create({
          data: {
            claimcode: code.claimcode,
            expiresAt: codeExpires,
            usesLeft: usesLeft,
            rooms: {
              connect: {
                roomId: roomId
              }
            }
          }
        });
      });

      return Promise.all(createCodes);
    })
    .then(() => {
      res.status(200).json({ message: 'Claim codes added successfully', codes });
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Internal Server Error' });
    });
});

// This fetches the claim/invite codes from the database and returns them as JSON
router.get('/logclaimcodes', adminAuth, (req, res) => {
  pp('Express: fetching claim codes');
  prisma.claimCodes
    .findMany()
    .then((claimCodes) => {
      res.status(401).json(claimCodes);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Internal Server Error' });
    });
});

// GET all rooms from the database and return them as JSON
router.get('/rooms', adminAuth, (req, res) => {
  pp(String('Express: fetching all rooms'));
  prisma.rooms
    .findMany()
    .then((rooms) => {
      res.status(200).json(rooms);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Internal Server Error' });
    });
});

/**
This code is used to verify the identity of a user by using the semaphore identity commitment and the external nullifier.
* @param {string} generatedProof - The proof generated by the user using the identity commitment and the external nullifier
* @returns {void}
*/
router.post(
  '/change-identity',
  limiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { generatedProof } = req.body as { generatedProof: IDCProof };

    const isValid = await verifyIdentityProof(generatedProof);

    if (isValid) {
      const updatedIdentity = await prisma.gateWayIdentity.update({
        where: {
          semaphoreIdentity: String(generatedProof.publicSignals.identityCommitment)
        },
        data: {
          semaphoreIdentity: String(generatedProof.publicSignals.externalNullifier)
        }
      });
      res.status(200).json({ message: 'Identity updated successfully', updatedIdentity });
    } else {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  })
);

/**
 * Sends system messages to the specified room, or all rooms if no room is specified
 * @params {string} message - The message to send
 * @params {string} roomId - The id of the room to send the message to
 * @returns {void}
 * @example {
 *          "message": "string",
 *          "roomId": "string"    // optional
 *          }
 */
router.post(
  '/message',
  adminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { message, roomId } = req.body as {
      message: string;
      roomId?: string;
    };

    try {
      // Function to send system messages
      await createSystemMessages(message, roomId);

      if (roomId) {
        pp(`Express: sending system message: ${message} to ${roomId}`);
        res.status(200).json({ message: `Message sent to room ${roomId}` });
      } else {
        pp(`Express: sending system message: ${message}`);
        res.status(200).json({ message: 'Messages sent to all rooms' });
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  })
);

/**
 * This code adds an admin to a room. The admin must be logged in and authorized to add an admin to the room.
 *  The admin must provide the room ID and the identity of the admin to be added.
 *  The code will then add the admin to the room's list of admin identities.
 *  @param {string} roomId - The id of the room to add the admin to
 *  @param {string} idc - The id of the admin to be added
 * @returns {void}
 * @example {
 *         "roomId": "string",
 *        "idc": "string"
 * }
 */
router.post(
  '/:roomId/addAdmin',
  adminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { roomId } = req.params;
    const { idc } = req.body as { idc: string };
    try {
      await prisma.rooms.update({
        where: {
          roomId: roomId
        },
        data: {
          adminIdentities: {
            push: idc
          }
        }
      });
      res.status(200).json({ message: `Admin added to room ${roomId}` });
    } catch (err) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  })
);

export default router;

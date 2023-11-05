import express from 'express';
import type { Request, Response } from 'express';
import { limiter } from '../middleware';
// import asyncHandler from 'express-async-handler';
import { PrismaClient } from '@prisma/client';
// import { verifyIdentityProof } from '../../crypto/idcVerifier/verifier';
import { pp } from '../../utils';
// import { IDCProof } from 'idc-nullifier/dist/types/types';
import { addRoomData } from '../../types';
import {
  findRoomById,
  // findRoomsByIdentity,
  createRoom,
  removeRoom,
  removeMessage
} from '../../data/db/';
import { MessageI, RoomI } from 'discreetly-interfaces';
import { RLNFullProof } from 'rlnjs';
import basicAuth from 'express-basic-auth';
import { generateRandomClaimCode } from 'discreetly-claimcodes';
const router = express.Router();
const prisma = new PrismaClient();

const adminPassword = process.env.PASSWORD
  ? process.env.PASSWORD
  : // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    (generateRandomClaimCode(4) as string);

const adminAuth = basicAuth({
  users: {
    admin: adminPassword
  }
});

// This code gets a room by its ID, and then checks if room is null.
// If room is null, it returns a 500 error.
// Otherwise, it returns a 200 status code and the room object.
router.get('/:id', limiter, (req, res) => {
  if (!req.params.id) {
    res.status(400).json({ error: 'Bad Request' });
  } else {
    const requestRoomId = req.params.id ?? '0';
    pp(String('Express: fetching room info for ' + req.params.id));
    findRoomById(requestRoomId)
      .then((room: RoomI) => {
        if (!room) {
          res.status(500).json({ error: 'Internal Server Error' });
        } else {
          const {
            roomId,
            name,
            rateLimit,
            userMessageLimit,
            membershipType,
            identities,
            bandadaAddress,
            bandadaGroupId,
            encrypted,
            ephemeral
          } = room || {};
          const id = String(roomId);
          const roomResult: RoomI = {
            id,
            roomId,
            name,
            rateLimit,
            userMessageLimit,
            membershipType,
            encrypted,
            ephemeral
          };
          // Add null check before accessing properties of room object
          if (membershipType === 'BANDADA_GROUP') {
            roomResult.bandadaAddress = bandadaAddress;
            roomResult.bandadaGroupId = bandadaGroupId;
          }
          if (membershipType === 'IDENTITY_LIST') {
            roomResult.identities = identities;
          }

          res.status(200).json(roomResult);
        }
      })
      .catch((err) => console.error(err));
  }
});

/** createRoom is used to create a new room in the database
 * @param {string} roomName - The name of the room
 * @param {number} rateLimit - The rate limit of the room
 * @param {number} userMessageLimit - The user message limit of the room
 * @param {number} numClaimCodes - The number of claim codes to generate
 * @param {number} approxNumMockUsers - The approximate number of mock users to generate
 * @param {string[]} adminIdentities - The identities of the admins of the room
 * @param {string} type - The type of room
 * @param {string} bandadaAddress - The address of the Bandada group
 * @param {string} bandadaGroupId - The id of the Bandada group
 * @param {string} bandadaAPIKey - The API key of the Bandada group
 * @param {string} membershipType - The type of membership
 * @param {string} roomId - The id of the room
 * @param {string[]} discordIds - The ids of the discord users to add to the room
 * @returns {void}
 * @example {
 *          "roomName": "string",
 *          "rateLimit": number,
 *          "userMessageLimit": number,
 *          "numClaimCodes": number,      // optional
 *          "approxNumMockUsers": number, // optional
 *          "adminIdentities": string[],  // optional
 *          "roomType": "string",         // optional
 *          "bandadaAddress": "string",   // optional
 *          "bandadaGroupId": "string",   // optional
 *          "bandadaAPIKey": "string",    // optional
 *          "membershipType": "string"    // optional if not an IDENTITY_LIST
 *          "roomId": "string",           // optional
 *          "discordIds": string[]        // optional
 *          }
 */
router.post('/add', adminAuth, (req, res) => {
  const roomMetadata = req.body as unknown as addRoomData;
  const roomName = roomMetadata.roomName;
  const rateLimit = roomMetadata.rateLimit;
  const userMessageLimit = roomMetadata.userMessageLimit;
  const numClaimCodes = roomMetadata.numClaimCodes ?? 0;
  const adminIdentities = roomMetadata.adminIdentities;
  const approxNumMockUsers = roomMetadata.approxNumMockUsers;
  const type = roomMetadata.roomType as unknown as string;
  const bandadaAddress = roomMetadata.bandadaAddress;
  const bandadaGroupId = roomMetadata.bandadaGroupId;
  const bandadaAPIKey = roomMetadata.bandadaAPIKey;
  const membershipType = roomMetadata.membershipType;
  const roomId = roomMetadata.roomId;
  createRoom(
    roomName,
    rateLimit,
    userMessageLimit,
    numClaimCodes,
    approxNumMockUsers,
    type,
    adminIdentities,
    bandadaAddress,
    bandadaGroupId,
    bandadaAPIKey,
    membershipType,
    roomId
  )
    .then((result) => {
      const response =
        result === null
          ? { status: 400, message: 'Room already exists' }
          : result
          ? {
              status: 200,
              message: 'Room created successfully',
              roomId: result.roomId,
              claimCodes: result.claimCodes
            }
          : { status: 500, error: 'Internal Server Error' };

      res.status(response.status).json(response);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: String(err) });
    });
});

/**
 * This code is used to delete a room from the database.
 *  It takes in the roomId from the request body, and pass it to the removeRoom function.
 *  If removeRoom returns true, it means the room is deleted successfully, and the server returns a 200 status code.
 *  If removeRoom returns false, the server returns a 500 status code.
 *  If removeRoom throws an error, the server returns a 500 status code.
 * @param {string} roomId - The id of the room to be deleted
 * @returns {void}
 *  */
router.post('/:roomId/delete', adminAuth, (req: Request, res: Response) => {
  const { roomId } = req.body as { roomId: string };
  removeRoom(roomId)
    .then((result) => {
      if (result) {
        res.status(200).json({ message: 'Room deleted successfully' });
      } else {
        res.status(500).json({ error: 'Internal Server Error' });
      }
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: String(err) });
    });
});

/**
 * This code deletes a message from a room
 * It takes in the roomId and messageId from the request body, and pass it to the removeMessage function.
 * If removeMessage returns true, it means the message is deleted successfully, and the server returns a 200 status code.
 * If removeMessage returns false, the server returns a 500 status code.
 * If removeMessage throws an error, the server returns a 500 status code.
 * @param {string} roomId - The id of the room to be deleted
 * @param {string} messageId - The id of the message to be deleted
 * @returns {void}
 * */
router.post('/:roomId/message/delete', adminAuth, (req, res) => {
  const { roomId } = req.params;
  const { messageId } = req.body as { messageId: string };

  removeMessage(roomId, messageId)
    .then((result) => {
      if (result) {
        res.status(200).json({ message: 'Message deleted successfully' });
      } else {
        res.status(500).json({ error: 'Internal Server Error' });
      }
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: String(err) });
    });
});

/**
 * This code handles the get request to get a list of messages for a particular room.
 * It uses the Prisma client to query the database and return the messages for a particular room.
 * It also parses the proof from a string to a JSON object.
 * @param {string} id - The id of the room to get messages for
 * @returns {void}
 */
router.get('/:id/messages', limiter, (req, res) => {
  const { id } = req.params;
  prisma.messages
    .findMany({
      take: 500,
      orderBy: {
        timeStamp: 'desc'
      },
      where: {
        roomId: id
      },
      select: {
        id: false,
        message: true,
        messageId: true,
        proof: true,
        roomId: true,
        timeStamp: true,
        sessionId: true,
        messageType: true
      }
    })
    .then((messages) => {
      messages.map((message: MessageI) => {
        message.timeStamp = new Date(message.timeStamp as Date).getTime();
        message.proof = JSON.parse(message.proof as string) as RLNFullProof;
        message.epoch = message.proof.epoch;
      });
      pp('Express: fetching messages for room ' + id);
      res.status(200).json(messages.reverse());
    })
    .catch((error: Error) => {
      pp(error, 'error');
      res.status(500).send('Error fetching messages');
    });
});

export default router;

import type { Express, RequestHandler, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { serverConfig } from '../config/serverConfig';
import { genClaimCodeArray, pp } from '../utils';
import {
  getRoomByID,
  getRoomsByIdentity,
  findClaimCode,
  updateClaimCode,
  updateRoomIdentities,
  findUpdatedRooms,
  createRoom,
  createSystemMessages
} from '../data/db';
import { MessageI, RoomI } from 'discreetly-interfaces';
import { RLNFullProof } from 'rlnjs';

const prisma = new PrismaClient();

function asyncHandler(fn: {
  (req: Request, res: Response): Promise<void>;
  (arg0: unknown, arg1: unknown): unknown;
}) {
  return (req, res) => {
    void Promise.resolve(fn(req, res)).catch((err) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      throw new Error(err);
    });
  };
}

export function initEndpoints(app: Express, adminAuth: RequestHandler) {
  // Endpoint that returns the ServerId, Server Name, and Server Version
  app.get(['/', '/api'], (req, res) => {
    pp('Express: fetching server info');
    res.status(200).json(serverConfig);
  });

  // Endpoint that returns the room info for a given roomId
  app.get(['/room/:id', '/api/room/:id'], (req, res) => {
    if (!req.params.id) {
      res.status(400).json({ error: 'Bad Request' });
    } else {
      const requestRoomId = req.params.id ?? '0';
      pp(String('Express: fetching room info for ' + req.params.id));
      getRoomByID(requestRoomId)
        .then((room: RoomI) => {
          if (!room) {
            // This is set as a timeout to prevent someone from trying to brute force room ids
            setTimeout(() => res.status(500).json({ error: 'Internal Server Error' }), 1000);
          } else {
            const {
              roomId,
              name,
              rateLimit,
              userMessageLimit,
              membershipType,
              identities,
              contractAddress,
              bandadaAddress,
              bandadaGroupId,
              type
            } = room || {};
            const id = String(roomId);
            const roomResult: RoomI = {
              id,
              roomId,
              name,
              rateLimit,
              userMessageLimit,
              membershipType
            };
            // Add null check before accessing properties of room object
            if (membershipType === 'BANDADA_GROUP') {
              roomResult.bandadaAddress = bandadaAddress;
              roomResult.bandadaGroupId = bandadaGroupId;
            }
            if (membershipType === 'IDENTITY_LIST') {
              roomResult.identities = identities;
            }
            if (type === 'CONTRACT') {
              roomResult.contractAddress = contractAddress;
            }
            res.status(200).json(roomResult);
          }
        })
        .catch((err) => console.error(err));
    }
  });

  // Endpoint that returns the room info for a given Rate Commitment
  app.get(
    ['/rooms/:idc', '/api/rooms/:idc'],
    asyncHandler(async (req: Request, res: Response) => {
      try {
        pp(String('Express: fetching rooms by identityCommitment ' + req.params.idc));
        res.status(200).json(await getRoomsByIdentity(req.params.idc));
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
      }
    })
  );

  interface JoinData {
    code: string;
    idc: string;
  }

  /* Endpoint that checks for your claim code, claims it,
  and updates the rooms identities to join a room
  {
    "code": "string",
    "idc": "string"
  }
  */
  app.post(
    ['/join', '/api/join'],
    asyncHandler(async (req: Request, res: Response) => {
      const parsedBody: JoinData = req.body as JoinData;

      if (!parsedBody.code || !parsedBody.idc) {
        res.status(400).json({ message: '{code: string, idc: string} expected' });
      }
      const { code, idc } = parsedBody;
      console.debug('Invite Code:', code);

      // Check if claim code is valid and not used before
      const codeStatus = await findClaimCode(code);
      if (!codeStatus || codeStatus.claimed) {
        res.status(400).json({ message: 'Claim code already used' });
        return;
      }

      // Update claim code
      const claimCode = await updateClaimCode(code);
      const roomIds = claimCode.roomIds;

      // Update Room Identities
      await updateRoomIdentities(idc, roomIds);

      // Find updated rooms
      const updatedRooms: RoomI[] = await findUpdatedRooms(roomIds);

      // Return the room ids of the updated rooms
      res.status(200).json({
        status: 'valid',
        roomIds: updatedRooms.map((room: RoomI) => room.roomId)
      });
    })
  );

  interface addRoomData {
    roomName: string;
    rateLimit: number;
    userMessageLimit: number;
    numClaimCodes?: number;
    approxNumMockUsers?: number;
    roomType?: string;
    bandadaAddress?: string;
    bandadaAPIKey?: string;
    bandadaGroupId?: string;
    membershipType?: string;
  }

  /* ~~~~ ADMIN ENDPOINTS ~~~~ */

  /* Endpoint that creates a room using admin credentials
  {
    "roomName": "string",
    "rateLimit": number,
    "userMessageLimit": number,
    "numClaimCodes": number,      // optional
    "approxNumMockUsers": number, // optional
    "roomType": "string",         // optional
    "bandadaAddress": "string",   // optional
    "bandadaGroupId": "string",   // optional
    membershipType: "string"      // optional if not an IDENTITY_LIST
  }
  */
  app.post(['/room/add', '/api/room/add'], adminAuth, (req, res) => {
    const roomMetadata = req.body as addRoomData;
    const roomName = roomMetadata.roomName;
    const rateLimit = roomMetadata.rateLimit;
    const userMessageLimit = roomMetadata.userMessageLimit;
    const numClaimCodes = roomMetadata.numClaimCodes ?? 0;
    const approxNumMockUsers = roomMetadata.approxNumMockUsers;
    const type = roomMetadata.roomType as unknown as string;
    const bandadaAddress = roomMetadata.bandadaAddress;
    const bandadaGroupId = roomMetadata.bandadaGroupId;
    const bandadaAPIKey = roomMetadata.bandadaAPIKey;
    const membershipType = roomMetadata.membershipType;
    createRoom(
      roomName,
      rateLimit,
      userMessageLimit,
      numClaimCodes,
      approxNumMockUsers,
      type,
      bandadaAddress,
      bandadaGroupId,
      bandadaAPIKey,
      membershipType
    )
      .then((result) => {
        if (result) {
          // TODO should return roomID and claim codes if they are generated
          res.status(200).json({ message: 'Room created successfully' });
        } else {
          res.status(500).json({ error: 'Internal Server Error' });
        }
      })
      .catch((err) => {
        console.error(err);
        res.status(500).json({ error: String(err) });
      });
  });

  // Endpoint to fetch messages for a given room
  app.get('/api/room/:id/messages', (req, res) => {
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
          timeStamp: true
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

  /* Endpoint to add claim codes to all rooms or a subset of rooms
  {
    "numCodes": number,
    "rooms": string[],  // optional
    "all": boolean
  }
  */
  app.post(
    ['/addcode', '/api/addcode'],
    adminAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const { numCodes, rooms, all } = req.body as {
        numCodes: number;
        rooms: string[];
        all: boolean;
      };
      const query = all ? undefined : { where: { roomId: { in: rooms } } };
      const codes = genClaimCodeArray(numCodes);
      // How would copilot do this better?
      return await prisma.rooms.findMany(query).then((rooms) => {
        const roomIds = rooms.map((room) => room.id);
        const createCodes = codes.map(async (code, index) => {
          return await prisma.claimCodes.create({
            data: {
              claimcode: code.claimcode,
              claimed: false,
              roomIds: roomIds,
              rooms: {
                connect: {
                  roomId: rooms[index].roomId ? rooms[index].roomId : undefined
                }
              }
            }
          });
        });
        return Promise.all(createCodes)
          .then(() => {
            res.status(200).json({ message: 'Claim codes added successfully' });
          })
          .catch((err) => {
            console.error(err);
            res.status(500).json({ error: 'Internal Server Error' });
          });
      });
    })
  );

  /* Endpoint to create claim codes for specific room
  will be used when we implement server owners/admins
  {
    "numCodes": number
  }
  */

  app.post(['/room/:roomId/addcode', '/api/room/:roomId/addcode'], adminAuth, (req, res) => {
    const { roomId } = req.params;
    const { numCodes } = req.body as { numCodes: number };
    const codes = genClaimCodeArray(numCodes);

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

        const createCodes = codes.map((code) => {
          return prisma.claimCodes.create({
            data: {
              claimcode: code.claimcode,
              claimed: false,
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
        res.status(200).json({ message: 'Claim codes added successfully' });
      })
      .catch((err) => {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
      });
  });

  // Endpoint to log all claim codes that exist
  app.get(['/logclaimcodes', '/api/logclaimcodes'], adminAuth, (req, res) => {
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

  // Endpoint to fetch all rooms that exist
  app.get(['/rooms', '/api/rooms'], adminAuth, (req, res) => {
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

  /* Endpoint to send system messages to all rooms
  or a single room if a roomId is passed
  {
    "message": "string",
    "roomId": "string"    // optional
  }
   */
  app.post('/admin/message', adminAuth, asyncHandler(async (req: Request, res: Response) => {
    const { message, roomId } = req.body as { message: string; roomId?: string };

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
  }));
}

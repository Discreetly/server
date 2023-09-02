import type { Express, RequestHandler, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { serverConfig } from '../config/serverConfig';
import { genClaimCodeArray, pp } from '../utils';
import {
  findRoomById,
  findRoomsByIdentity,
  findClaimCode,
  updateClaimCode,
  updateRoomIdentities,
  findUpdatedRooms,
  createRoom,
  createSystemMessages
} from '../data/db/';
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
  // This code is used to fetch the server info from the api
  // This is used to display the server info on the client side
  app.get(['/', '/api'], (req, res) => {
    pp('Express: fetching server info');
    res.status(200).json(serverConfig);
  });

  // This code gets a room by its ID, and then checks if room is null.
  // If room is null, it returns a 500 error.
  // Otherwise, it returns a 200 status code and the room object.

  app.get(['/room/:id', '/api/room/:id'], (req, res) => {
    if (!req.params.id) {
      res.status(400).json({ error: 'Bad Request' });
    } else {
      const requestRoomId = req.params.id ?? '0';
      pp(String('Express: fetching room info for ' + req.params.id));
      findRoomById(requestRoomId)
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
              semaphoreIdentities,
              bandadaAddress,
              bandadaGroupId
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
              roomResult.semaphoreIdentities = semaphoreIdentities;
            }
            if (membershipType === 'IDENTITY_LIST') {
              roomResult.identities = identities;
              roomResult.semaphoreIdentities = semaphoreIdentities;
            }

            res.status(200).json(roomResult);
          }
        })
        .catch((err) => console.error(err));
    }
  });

  /** This function gets the rooms that a user is a member of.
   * @param {string} idc - The id of the identity to get rooms for.
   * @returns {Array} - An array of room objects.
   */

  app.get(
    ['/rooms/:idc', '/api/rooms/:idc'],
    asyncHandler(async (req: Request, res: Response) => {
      try {
        res.status(200).json(await findRoomsByIdentity(req.params.idc));
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

  /**
   * This code is used to update the room identities of the rooms that the user is joining.
   * The code updates the claim code and sets it to be claimed.
   * It then updates the room identities of the user joining.
   * Finally, it finds the rooms that have been updated and returns them.
   *  @param {string} code - The claim code to be updated
   *  @param {string} idc - The id of the identity to be added to the room
   *  @returns {Array} - An array of room objects
   *  @example {
   *            "code": "string",
   *            "idc": "string"
   *           }
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

      const codeStatus = await findClaimCode(code);
      if (!codeStatus || codeStatus.claimed) {
        res.status(400).json({ message: 'Claim code already used' });
        return;
      }

      const claimCode = await updateClaimCode(code);
      const roomIds = claimCode.roomIds;

      const addedRooms = await updateRoomIdentities(idc, roomIds);

      const updatedRooms = await findUpdatedRooms(addedRooms as string[]);

      // Return the room ids of the updated rooms
      if (updatedRooms.length > 0) {
        res.status(200).json({
          status: 'valid',
          roomIds: updatedRooms.map((room: RoomI) => room.roomId)
        });
      } else {
        res
          .status(400)
          .json({ message: `No rooms found or identity already exists in ${String(roomIds)}` });
      }
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

  /** createRoom is used to create a new room in the database
   * @param {string} roomName - The name of the room
   * @param {number} rateLimit - The rate limit of the room
   * @param {number} userMessageLimit - The user message limit of the room
   * @param {number} numClaimCodes - The number of claim codes to generate
   * @param {number} approxNumMockUsers - The approximate number of mock users to generate
   * @param {string} type - The type of room
   * @param {string} bandadaAddress - The address of the Bandada group
   * @param {string} bandadaGroupId - The id of the Bandada group
   * @param {string} bandadaAPIKey - The API key of the Bandada group
   * @param {string} membershipType - The type of membership
   * @returns {void}
   * @example {
   *          "roomName": "string",
   *          "rateLimit": number,
   *          "userMessageLimit": number,
   *          "numClaimCodes": number,      // optional
   *          "approxNumMockUsers": number, // optional
   *          "roomType": "string",         // optional
   *          "bandadaAddress": "string",   // optional
   *          "bandadaGroupId": "string",   // optional
   *          "bandadaAPIKey": "string",    // optional
   *          "membershipType": "string"      // optional if not an IDENTITY_LIST
   *          }
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

  /*
  This code handles the get request to get a list of messages for a particular room.
   It uses the Prisma client to query the database and return the messages for a particular room.
    It also parses the proof from a string to a JSON object.
*/
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
   * @returns {void}
   * @example {
   *          "numCodes": number,
   *          "rooms": string[],  // optional
   *          "all": boolean
   *          }
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
      return await prisma.rooms.findMany(query).then((rooms) => {
        const roomIds = rooms.map((room) => room.id);
        const createCodes = codes.map((code) => {
          return prisma.claimCodes
            .create({
              data: {
                claimcode: code.claimcode,
                claimed: false,
                roomIds: roomIds
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
   * @param {string} roomId The id of the room to add codes to
   * @returns {void}
   * @example {
   *          "numCodes": number
   *          }
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
        // Map over the codes array and create a claim code for each code
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

  // This code fetches the claim codes from the database.

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

  // GET all rooms from the database and return them as JSON
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

  app.post(
    '/admin/message',
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
}

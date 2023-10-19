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
  createSystemMessages,
  removeRoom,
  removeMessage
} from '../data/db/';
import { MessageI, RoomI } from 'discreetly-interfaces';
import { RLNFullProof } from 'rlnjs';
import {
  ecrecover,
  pubToAddress,
  bufferToHex,
  fromRpcSig,
  toBuffer,
  hashPersonalMessage
} from 'ethereumjs-util';
import { SNARKProof } from 'idc-nullifier/dist/types/types';
import { verifyIdentityProof } from '../crypto/idcVerifier/verifier';
// import expressBasicAuth from 'express-basic-auth';

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
            setTimeout(
              () => res.status(500).json({ error: 'Internal Server Error' }),
              1000
            );
          } else {
            const {
              roomId,
              name,
              rateLimit,
              userMessageLimit,
              membershipType,
              identities,
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

  /** This function gets the rooms that a user is a member of.
   * @param {string} idc - The id of the identity to get rooms for.
   * @returns {Array} - An array of room objects.
   */
  app.get(
    ['/rooms/:idc', '/api/rooms/:idc'],
    asyncHandler(async (req: Request, res: Response) => {
      const { proof } = req.body as { proof: SNARKProof };
      const isValid = await verifyIdentityProof(proof);
      if (isValid) {
        try {
          res.status(200).json(await findRoomsByIdentity(req.params.idc));
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: 'Internal Server Error' });
        }
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
        res
          .status(400)
          .json({ message: '{code: string, idc: string} expected' });
      }
      const { code, idc } = parsedBody;
      console.debug('Invite Code:', code);

      const foundCode = await findClaimCode(code);
      if (foundCode && foundCode.expiresAt < Date.now()) {
        await prisma.claimCodes.delete({
          where: {
            claimcode: code
          }
        });
        res.status(400).json({ message: 'Claim Code Expired' });
        return;
      }
      if (foundCode && (foundCode.usesLeft >= 0 || foundCode.usesLeft === -1)) {
        const updatedCode = await updateClaimCode(code, idc);
        if (updatedCode && updatedCode.usesLeft === 0) {
          await prisma.claimCodes.delete({
            where: {
              claimcode: code
            }
          });
        }
      } else {
        res.status(400).json({ message: 'Invalid Claim Code' });
        return;
      }
      const roomIds = foundCode.roomIds;
      const addedRooms = await updateRoomIdentities(
        idc,
        roomIds,
        foundCode.discordId!
      );
      const updatedRooms = await findUpdatedRooms(addedRooms as string[]);

      // Return the room ids of the updated rooms
      if (updatedRooms.length > 0) {
        res.status(200).json({
          status: 'valid',
          roomIds: updatedRooms.map((room: RoomI) => room.roomId)
        });
      } else {
        res.status(400).json({
          message: `No rooms found or identity already exists in ${String(
            roomIds
          )}`
        });
      }
    })
  );

  interface addRoomData {
    roomName: string;
    rateLimit: number;
    userMessageLimit: number;
    numClaimCodes?: number;
    approxNumMockUsers?: number;
    adminIdentities?: string[];
    roomType?: string;
    bandadaAddress?: string;
    bandadaAPIKey?: string;
    bandadaGroupId?: string;
    membershipType?: string;
    roomId?: string;
    admin?: boolean;
    discordIds?: string[];
  }

  /* ~~~~ ADMIN ENDPOINTS ~~~~ */

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
  app.post(['/room/add', '/api/room/add'], adminAuth, (req, res) => {
    const roomMetadata = req.body as addRoomData;
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

  app.post(
    ['/room/:roomId/delete', '/api/room/:roomId/delete'],
    adminAuth,
    (req: Request, res: Response) => {
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
    }
  );

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

  app.post(
    ['/room/:roomId/message/delete', '/api/room/:roomId/message/delete'],
    adminAuth,
    (req, res) => {
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
    }
  );

  /**
   * This code handles the get request to get a list of messages for a particular room.
   * It uses the Prisma client to query the database and return the messages for a particular room.
   * It also parses the proof from a string to a JSON object.
   * @param {string} id - The id of the room to get messages for
   * @returns {void}
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
   * @param {number} expiresAt - The date the codes expire - if not specified, defaults to 3 months from now
   * @param {number} usesLeft - The number of uses left for the codes - if not specified, defaults to -1 (unlimited)
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
  app.post(
    ['/addcode', '/api/addcode'],
    adminAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const { numCodes, rooms, all, expiresAt, usesLeft, discordId } =
        req.body as {
          numCodes: number;
          rooms: string[];
          all: boolean;
          expiresAt: number;
          usesLeft: number;
          discordId: string;
        };

      const currentDate = new Date();
      const threeMonthsLater = new Date(currentDate).setMonth(
        currentDate.getMonth() + 3
      );

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
            res
              .status(200)
              .json({ message: 'Claim codes added successfully', codes });
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
  app.post(
    ['/room/:roomId/addcode', '/api/room/:roomId/addcode'],
    adminAuth,
    (req, res) => {
      const { roomId } = req.params;
      const { numCodes, expires, usesLeft } = req.body as {
        numCodes: number;
        expires: number;
        usesLeft: number;
      };
      const codes = genClaimCodeArray(numCodes);

      const currentDate = new Date();
      const threeMonthsLater = new Date(currentDate).setMonth(
        currentDate.getMonth() + 3
      );

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
          res
            .status(200)
            .json({ message: 'Claim codes added successfully', codes });
        })
        .catch((err) => {
          console.error(err);
          res.status(500).json({ error: 'Internal Server Error' });
        });
    }
  );

  // This fetches the claim/invite codes from the database and returns them as JSON
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

  app.post(['/change-identity', '/api/change-identity'], asyncHandler(async (req: Request, res: Response) => {
    const { generatedProof } = req.body as { generatedProof: SNARKProof };

    const isValid = await verifyIdentityProof(generatedProof);

    if (isValid) {
      const updatedIdentity = await prisma.gateWayIdentity.update({
        where: {
          semaphoreIdentity: String(generatedProof.publicSignals.identityCommitment)
        },
        data: {
          semaphoreIdentity: String(generatedProof.publicSignals.externalNullifier)
        }
      })
      res.status(200).json({ message: 'Identity updated successfully', updatedIdentity });
    } else {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }))

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

app.post(
    '/room/:roomId/addAdmin',
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

 // This endpoint returns a list of all Ethereum groups in the database.

 app.get(['/eth/groups/all', '/api/eth/groups/all'], adminAuth, (req, res) => {
    prisma.ethereumGroup
      .findMany({
        select: {
          name: true
        }
      })
      .then((groups) => {
        res.status(200).json(groups);
      })
      .catch((err) => {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
      });
  });

  /**
   * This code gets the Ethereum group with the given address.
   * @param {string} address - The address of the Ethereum group to get
   * @returns {void}
   * @example {
   *         "address": "string"
   * }
*/
app.get(['/eth/group/:address', '/api/eth/group/:address'], (req, res) => {
    const { address } = req.params as { address: string };
    prisma.ethereumGroup
      .findMany({
        where: {
          ethereumAddresses: {
            has: address
          }
        },
        select: {
          name: true
        }
      })
      .then((groups) => {
        res.status(200).json(groups);
      })
      .catch((err) => {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
      });
  });

/**
 * This code creates a new Ethereum group with the given name, and
 * connects the group to the given rooms. It then sends back a JSON
 * response with the newly created Ethereum group.
  * @param {string} name - The name of the Ethereum group to create
  * @param {string[]} roomIds - The ids of the rooms to connect to the group
  * @returns {void}
  * @example {
  *        "name": "string",
  *       "roomIds": string[]
  * }
 */

app.post(
    ['/eth/group/create', '/api/eth/group/create'],
    adminAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const { name, roomIds } = req.body as {
        name: string;
        roomIds: string[];
      };
      const ethereumGroup = await prisma.ethereumGroup.create({
        data: {
          name: name,
          rooms: {
            connect: roomIds.map((roomId) => ({ roomId }))
          }
        }
      });
      res.json({ success: true, ethereumGroup });
    })
  );


  /**  Add a new ethereum address to a group
   * @param {string[]} names - The names of the Ethereum groups to add the address to
   * @param {string[]} ethAddresses - The addresses to add to the Ethereum groups
  */
app.post(
    ['/eth/group/add', '/api/eth/group/add'],
    adminAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const { names, ethAddresses } = req.body as {
        names: string[];
        ethAddresses: string[];
      };
      if (!names) return;
      const groups = await prisma.ethereumGroup.updateMany({
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
      res.json({ success: true, groups });
    })
  );



/** This code creates a new Ethereum group by adding a new entry to the EthereumGroup table in the database.
 *  The body of the request contains the name of the group, the ethereum addresses to associate with the group,
 *  and the room IDs to associate with the group. The code uses Prisma to create a new entry in the EthereumGroup table,
 *  and then returns the newly created group.
 * @param {string} name - The name of the Ethereum group to create
 * @param {string[]} ethAddresses - The addresses to add to the Ethereum groups
 * @param {string[]} roomIds - The ids of the rooms to connect to the group
 * @returns {void}
 * @example {
 *       "name": "string",
 *      "ethAddresses": string[],
 *     "roomIds": string[]
 * }
*/
app.post(
    ['/eth/group/edit', '/api/eth/group/edit'],
    adminAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const { name, ethAddresses, roomIds } = req.body as {
        name: string;
        ethAddresses: string[];
        roomIds: [];
      };
      try {
        const foundGroup = await prisma.ethereumGroup.findUnique({
          where: {
            name: name
          },
          select: {
            ethereumAddresses: true
          }
        });
        let addresses: string[] = [];
        if (foundGroup?.ethereumAddresses) {
          addresses = ethAddresses.filter((address) => {
            return !(foundGroup.ethereumAddresses).includes(
              address
            );
          });
        }
        const updatedGroup = await prisma.ethereumGroup.update({
          where: {
            name: name
          },
          data: {
            ethereumAddresses: {
              push: addresses
            },
            rooms: {
              connect: roomIds.map((roomId) => ({ roomId }))
            }
          }
        });
        res.json({ success: true, updatedGroup });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
      }
    })
  );

  /** This code deletes an ethereum group from the database.
   * @param {string} name - The name of the Ethereum group to delete
   * @returns {void}
   * @example {
   *      "name": "string"
   * }
    */
app.post(
    ['/eth/group/delete', '/api/eth/group/delete'],
    adminAuth,
    (req, res) => {
      const { name } = req.body as { name: string };
      prisma.ethereumGroup
        .delete({
          where: {
            name: name
          }
        })
        .then((group) => {
          res.status(200).json(group);
        })
        .catch((err) => {
          console.error(err);
          res.status(500).json({ error: 'Internal Server Error' });
        });
    }
  );

  /**
  * This code validates the signature in the request body and if it is valid,
  * it will store the semaphore identity and ethereum address in the database.
  * It will also return an array of roomIds that the user should join.
  * @param {string} message - The message to be signed in this case their semaphore identity
  * @param {string} signature - The signature of the message in this case their private key
  * @returns {void}
  * @example {
  *        "message": "string",
  *      "signature": "string"
  * }
  */
app.post(
    ['/eth/message/sign', '/api/eth/message/sign'],
    adminAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const { message, signature } = req.body as {
        message: string;
        signature: string;
      };

      try {
        const msgHex = bufferToHex(Buffer.from(message));
        const msgBuffer = toBuffer(msgHex);
        const msgHash = hashPersonalMessage(msgBuffer);

        const { v, r, s } = fromRpcSig(signature);
        const publicKey = ecrecover(msgHash, v, r, s);
        const address = pubToAddress(publicKey);

        const recoveredAddress = bufferToHex(address);
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

        res.json({ status: 'valid', roomIds: roomIds });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
      }
    })
  );

  /*---------------------DISCORD BOT APIS ---------------------*/

  /**
   * Creates a new guild in the database when the bot is added to a discord server.
   * @param {string} guildId - The id of the guild to be added
   * @returns {void}
   */
  app.post('/api/discord/addguild', adminAuth, (req, res) => {
    const { guildId } = req.body as {
      guildId: string;
    };
    if (!guildId) {
      res.status(400).json({ error: 'Bad Request' });
      return;
    }
    prisma.discord
      .upsert({
        where: {
          discordServerId: guildId
        },
        update: {},
        create: {
          discordServerId: guildId
        }
      })
      .then(() => {
        res.status(200).json({ message: 'Discord guild added successfully' });
        return true;
      })
      .catch((err) => {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
        return false;
      });
  });
  /**
   *  This code creates a new role-room mapping in the database if one does not already exist,
   *  otherwise it updates the mapping with the new roles.
   * @param {string[]} roles - The roles to be added to the room
   * @param {string} roomId - The id of the room to be added
   * @param {string} guildId - The id of the guild to be added
   * @returns {void}
   */

  app.post('/api/discord/addrole', adminAuth, (req, res) => {
    const { roles, roomId, guildId } = req.body as {
      roles: string[];
      roomId: string;
      guildId: string;
    };
    if (!roles || !roomId || !guildId) {
      res.status(400).json({ error: 'Bad Request' });
      return;
    }
    prisma.discordRoleRoomMapping
      .upsert({
        where: {
          roomId: roomId
        },
        update: {
          roles: {
            set: roles
          }
        },
        create: {
          roomId: roomId,
          discordServerId: guildId,
          roles: {
            set: roles
          }
        }
      })
      .then(() => {
        res.status(200).json({ message: 'Discord roles added successfully' });
        return true;
      })
      .catch((err) => {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
        return false;
      });
  });

  /**
   * This code takes the roleId from the request body and tries to find all the rooms that have that role mapped to it.
   *  If it finds any, it returns them as a list in the response body.
   * If it doesn't find any, it returns a 404 error.
   * If it throws an error, it returns a 500 error.
   * @param {string} roleId - The id of the role to be added
   * @returns {string[]} - An array of room ids
   *  */

  app.post(
    '/api/discord/getrooms',
    adminAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const { roles, discordId } = req.body as {
        roles: string[];
        discordId: string;
      };
      if (roles.length === 0 || !discordId) {
        res.status(400).json({ error: 'Bad Request' });
        return;
      }
      const rooms = await prisma.gateWayIdentity.findFirst({
        where: {
          discordId: discordId
        },
        include: {
          rooms: true
        }
      });
      if (rooms) {
        const roomIds = rooms.rooms.map((room) => room.roomId);
        const filteredRooms: string[] = [];
        const filteredNames: string[] = [];
        for (const role of roles) {
          const discordRoleRoomMapping =
            await prisma.discordRoleRoomMapping.findMany({
              where: {
                roles: {
                  has: role
                }
              }
            });
          const mappingRoomIds = discordRoleRoomMapping.map(
            (mapping) => mapping.roomId
          );
          const newRooms = mappingRoomIds.filter((roomId) =>
            roomIds.includes(roomId)
          );
          const newRoomNames = newRooms.map((roomId) => {
            const room = rooms.rooms.find((room) => room.roomId === roomId);
            return room?.name;
          });
          filteredRooms.push(...newRooms);
          filteredNames.push(...(newRoomNames as string[]));
        }
        console.log(filteredRooms);
        res
          .status(200)
          .json({ rooms: filteredRooms, roomNames: filteredNames });
      } else {
        const roomIds: string[] = [];

        for (const role of roles) {
          const discordRoleRoomMapping =
            await prisma.discordRoleRoomMapping.findMany({
              where: {
                roles: {
                  has: role
                }
              }
            });
          const mappingRoomIds = discordRoleRoomMapping.map(
            (mapping) => mapping.roomId
          );
          roomIds.push(...mappingRoomIds);
        }
        const roomNames = await prisma.rooms.findMany({
          where: {
            roomId: {
              in: roomIds
            }
          },
          select: {
            name: true
          }
        });
        res.status(200).json({
          rooms: roomIds,
          roomNames: roomNames.map((room) => room.name)
        });
      }
    })
  );

  /**
   * This endpoint takes a discord user id and returns all rooms that the user is a part of.
   * @param {string} discordUserId - The id of the discord user to get rooms for
   * @returns {string[]} - An array of rooms that the user is a part of
   */

  app.post('/api/discord/rooms', adminAuth, (req, res) => {
    const { discordUserId } = req.body as { discordUserId: string };
    console.log('here');
    prisma.gateWayIdentity
      .findFirst({
        where: {
          discordId: discordUserId
        },
        include: {
          rooms: true
        }
      })
      .then((identity) => {
        res.status(200).json(identity);
      })
      .catch((err) => {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
      });
  });


  /**
   * This endpoint gets all the rooms that a user is allowed to access based on their discordId.
   * @params {string} discordId - The id of the discord user to get rooms for
   * @returns {string[]} - An array of rooms that the user is a part of
   */

  app.post('/api/discord/checkrooms', adminAuth, (req, res) => {
    const { discordId } = req.body as { discordId: string };
    prisma.discordRoleRoomMapping
      .findMany({
        where: {
          discordServerId: discordId
        }
      })
      .then((rooms) => {
        res.status(200).json(rooms);
        return rooms;
      })
      .catch((err) => {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
      });
  });
}

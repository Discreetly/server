import type { Express, RequestHandler } from 'express';
import { PrismaClient } from '@prisma/client';
import { serverConfig } from '../config/serverConfig';
import { pp } from '../utils.js';
import { createRoom, getRoomByID, getRoomsByIdentity } from '../data/db';
import { RoomI } from 'discreetly-interfaces';

export function initEndpoints(app: Express, adminAuth: RequestHandler) {
  const prisma = new PrismaClient();

  app.get(['/', '/api'], (req, res) => {
    pp('Express: fetching server info');
    res.json(serverConfig);
  });

  app.get('/api/room/:id', (req, res) => {
    pp(String('Express: fetching room info for ' + req.params.id));
    getRoomByID(req.params.id)
      .then((room: RoomI) => {
        if (!room) {
          // This is set as a timeout to prevent someone from trying to brute force room ids
          setTimeout(() => res.status(500).json({ error: 'Internal Server Error' }), 1000);
        } else {
          res.status(200).json(room);
        }
      })
      .catch((err) => console.error(err));
  });

  app.get('/api/rooms/:idc', (req, res) => {
    pp(String('Express: fetching rooms by identityCommitment ' + req.params.idc));
    res.json(getRoomsByIdentity(req.params.idc));
  });

  app.post('/join', (req, res) => {
    interface JoinRequestBody {
      code: string;
      idc: string;
    }
    console.log(req.body);
    const { code, idc } = req.body as JoinRequestBody;

    pp(`Express[/join]: claiming code: ${code}`);

    prisma.claimCodes
      .findUnique({
        where: {
          claimcode: code
        }
      })
      .then((codeStatus: { claimed: boolean; roomIds: string[] }) => {
        console.log(codeStatus);
        if (codeStatus.claimed === false) {
          prisma.claimCodes
            .update({
              where: {
                claimcode: code
              },
              data: {
                claimed: true
              }
            })
            .then((claimCode: { roomIds: string[] }) => {
              const roomIds = claimCode.roomIds.map((room) => room);
              prisma.rooms
                .updateMany({
                  where: {
                    roomId: {
                      in: roomIds
                    }
                  },
                  data: {
                    identities: {
                      push: idc
                    }
                  }
                })
                .then(async () => {
                  // return the room name of all the rooms that were updated
                  const updatedRooms = await prisma.rooms.findMany({
                    where: {
                      id: {
                        in: roomIds
                      }
                    }
                  });
                  res
                    .status(200)
                    .json({ status: 'valid', roomIds: updatedRooms.map((room) => room.roomId) });
                })
                .catch((err) => {
                  console.error(err);
                  res.status(500).json({ error: 'Internal Server Error' });
                });
            })
            .catch((err) => {
              console.error(err);
              res.status(500).json({ error: 'Internal Server Error' });
            });
        } else {
          res.status(400).json({ message: 'Claim code already used' });
        }
      })
      .catch((err) => {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
      });
  });

  /* ~~~~ ADMIN ENDPOINTS ~~~~ */
  app.post('/room/add', adminAuth, (req, res) => {
    interface RoomData {
      roomName: string;
      rateLimit: number;
      userMessageLimit: number;
      numClaimCodes?: number;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const roomMetadata = req.body.data as RoomData;
    const roomName = roomMetadata.roomName;
    const rateLimit = roomMetadata.rateLimit;
    const userMessageLimit = roomMetadata.userMessageLimit;
    const numClaimCodes = roomMetadata.numClaimCodes || 0;
    const result = createRoom(roomName, rateLimit, userMessageLimit, numClaimCodes);
    if (result) {
      // TODO should return roomID and claim codes if they are generated
      res.status(200).json({ message: 'Room created successfully' });
    } else {
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get('/logclaimcodes', adminAuth, (req, res) => {
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

  app.get('/api/rooms', adminAuth, (req, res) => {
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
}

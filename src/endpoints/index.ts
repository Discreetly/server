import type { Express } from 'express';
import { PrismaClient } from '@prisma/client';
import { serverConfig } from '../config/serverConfig';
import { pp } from '../utils.js';
import { getRoomByID, getRoomsByIdentity, findClaimCode, updateClaimCode, updateRoomIdentities, findUpdatedRooms } from '../data/db';
import { RoomI, genId } from 'discreetly-interfaces';

// TODO! Properly handle authentication for admin endpoints
// TODO api endpoint that creates new rooms and generates invite codes for them

export function initEndpoints(app: Express) {
  const prisma = new PrismaClient();

  app.get(['/', '/api'], (req, res) => {
    pp('Express: fetching server info');
    res.json(serverConfig);
  });

  app.get('/logclaimcodes', (req, res) => {
    pp('Express: fetching claim codes');
    prisma.claimCodes
      .findMany()
      .then((claimCodes) => {
        console.log(claimCodes);
        res.status(401).send('Unauthorized');
      })
      .catch((err) => {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
      });
  });

  app.get('/api/rooms', (req, res) => {
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

  app.post("/join", (req, res) => {
    interface JoinRequestBody {
      code: string;
      idc: string;
    }
    const { code, idc } = req.body as JoinRequestBody;
    findClaimCode(code)
      .then((codeStatus) => {
        if (codeStatus && codeStatus.claimed === false) {
          return updateClaimCode(code)
            .then((claimCode) => {
              const roomIds = claimCode.roomIds.map((room) => room);
              return updateRoomIdentities(idc, roomIds)
                .then(() => {
                  return findUpdatedRooms(roomIds)
                    .then((updatedRooms: RoomI[]) => {
                      return res.status(200).json({
                        status: "valid",
                        roomIds: updatedRooms.map((room) => room.roomId),
                      });
                    });
                });
            });
        } else {
          res.status(400).json({ message: "Claim code already used" });
        }
      })
      .catch((err: Error) => {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
      });
  });

  app.post('/room/add', (req, res) => {
    interface RoomData {
      password: string;
      roomName: string;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const { password, roomName } = req.body.data as RoomData;
    if (password === process.env.PASSWORD) {
      prisma.rooms
        .create({
          data: {
            roomId: genId(BigInt(serverConfig.id), roomName).toString(),
            name: roomName
          }
        })
        .then((newRoom) => {
          res.status(200).json(newRoom);
        })
        .catch((error: Error) => {
          console.error(error);
          res.status(500).send('Error creating new room');
        });
    } else {
      res.status(401).send('Unauthorized');
    }
  });

  app.get('/api/room/:id/messages', (req, res) => {
    const { id } = req.params;
    prisma.messages
      .findMany({
        where: {
          roomId: id
        }
      })
      .then((messages) => {
        pp('Express: fetching messages for room ' + id)
        res.status(200).json(messages);
      })
      .catch((error: Error) => {
        pp(error, 'error')
        res.status(500).send('Error fetching messages');
      });
  }
  )
};

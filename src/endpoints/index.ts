import type { Express, RequestHandler } from 'express';
import { PrismaClient } from '@prisma/client';
import { serverConfig } from '../config/serverConfig';
import { pp } from '../utils';
import {
  getRoomByID,
  getRoomsByIdentity,
  findClaimCode,
  updateClaimCode,
  updateRoomIdentities,
  findUpdatedRooms,
  createRoom
} from '../data/db';
import { RoomI } from 'discreetly-interfaces';

const prisma = new PrismaClient();
export function initEndpoints(app: Express, adminAuth: RequestHandler) {

  app.get(['/', '/api'], (req, res) => {
    pp('Express: fetching server info');
    res.status(200).json(serverConfig);
  });

  app.get(['/room/:id', '/api/room/:id'], (req, res) => {
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

  app.get(['/rooms/:idc', '/api/rooms/:idc'], (req, res) => {
    pp(String('Express: fetching rooms by identityCommitment ' + req.params.idc));
    res.json(getRoomsByIdentity(req.params.idc));
  });

  interface JoinData {
    code: string;
    idc: string;
  }

  app.post(['/join', '/api/join'], (req, res) => {
    const { code, idc } = req.body as JoinData;
    console.log('Invite Code:', code);
    findClaimCode(code)
      .then((codeStatus) => {
        if (codeStatus && codeStatus.claimed === false) {
          return updateClaimCode(code).then((claimCode) => {
            const roomIds = claimCode.roomIds.map((room) => room.roomId);
            return updateRoomIdentities(idc, roomIds).then(() => {
              return findUpdatedRooms(roomIds).then((updatedRooms: RoomI[]) => {
                return res.status(200).json({
                  status: 'valid',
                  roomIds: updatedRooms.map((room: RoomI) => room.roomId)
                });
              });
            });
          });
        } else {
          return res.status(400).json({ message: 'Claim code already used' });
        }
      })
      .catch((err: Error) => {
        console.error(err);
        return res.status(500).json({ error: 'Internal Server Error' });
      });
  });

  /* ~~~~ ADMIN ENDPOINTS ~~~~ */
  app.post(['/room/add', '/api/room/add'], adminAuth, (req, res) => {
    interface RoomData {
      roomName: string;
      rateLimit: number;
      userMessageLimit: number;
      numClaimCodes?: number;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const roomMetadata = req.body as RoomData;
    console.log(roomMetadata)
    const roomName = roomMetadata.roomName;
    const rateLimit = roomMetadata.rateLimit;
    const userMessageLimit = roomMetadata.userMessageLimit;
    const numClaimCodes = roomMetadata.numClaimCodes || 0;
    const result = createRoom(roomName, rateLimit, userMessageLimit, numClaimCodes);
    console.log(result);
    if (result) {
      // TODO should return roomID and claim codes if they are generated
      res.status(200).json({ message: 'Room created successfully' });
    } else {
      return res.status(500).json({ error: 'Internal Server Error' });
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
        pp('Express: fetching messages for room ' + id);
        res.status(200).json(messages);
      })
      .catch((error: Error) => {
        pp(error, 'error');
        res.status(500).send('Error fetching messages');
      });
  });

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

}

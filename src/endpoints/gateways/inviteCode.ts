import express from 'express';
import type { Request, Response } from 'express';
import {  limiter } from '../middleware';
import { PrismaClient } from '@prisma/client';
import asyncHandler from 'express-async-handler';
import {
  findClaimCode,
  updateClaimCode,
  updateRoomIdentities,
  findUpdatedRooms,
} from '../../data/db/';
import { GatewayInviteDataI } from '../../types';
import { RoomI } from 'discreetly-interfaces';

const router = express.Router();
const prisma = new PrismaClient();


router.post(
  ['/gateway/join', '/api/gateway/join'],
  limiter,
  asyncHandler(async (req: Request, res: Response) => {
    const parsedBody: GatewayInviteDataI = req.body as GatewayInviteDataI;

    if (!parsedBody.code || !parsedBody.idc) {
      res.status(400).json({ message: '{code: string, idc: string} expected' });
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
    const addedRooms = await updateRoomIdentities(idc, roomIds, foundCode.discordId!);
    if (addedRooms.length === 0) {
      res.status(400).json({
        status: 'already-added',
        message: `Identity already exists in ${String(roomIds)}`
      });
    } else {
      const updatedRooms = await findUpdatedRooms(addedRooms);

      // Return the room ids of the updated rooms
      if (updatedRooms.length > 0) {
        res.status(200).json({
          status: 'valid',
          roomIds: updatedRooms.map((room: RoomI) => room.roomId)
        });
      } else {
        res.status(400).json({
          status: 'already-added',
          message: `No rooms found for ${String(roomIds)}`
        });
      }
    }
  })
);



export default router;

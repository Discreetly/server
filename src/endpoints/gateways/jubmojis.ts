import express from 'express';
import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { limiter } from '../middleware';
import asyncHandler from 'express-async-handler';
import { addIdentityToIdentityListRooms } from '../../data/db';
import { RoomI } from 'discreetly-interfaces';
import { jubmojiVerifier } from '../../gateways/jubmojis/jubmoji';
import { JubmojiRequestI } from '../../gateways/jubmojis/jubmoji.types';

const router = express.Router();
const prisma = new PrismaClient();

export interface JoinResponseI {
  status: string;
  roomIds?: string[];
  message?: string;
}

/**
 * This code is the API route used to verify the proof submitted by the user.
 * It uses the SNARKProof type and idc from the request body to verify the proof. If it is valid,
 * it adds the identity to the room and returns the roomId. If it is invalid, it returns an error.
 * @param {SNARKProof} proof - The SNARKProof object from the user
 * @param {string} idc - The identity commitment of the user
 * @returns {void}
 */
router.post(
  '/join',
  limiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { proof, idc } = req.body as { proof: string; idc: string };
    const isValid = await jubmojiVerifier(JSON.parse(proof) as JubmojiRequestI);
    const jubmojiRoomId = process.env.JUBMOJI_ROOM_ID
      ? process.env.JUBMOJI_ROOM_ID
      : '10212131510919';
    if (isValid) {
      const room = (await prisma.rooms.findUnique({
        where: {
          roomId: jubmojiRoomId
        }
      })) as RoomI;
      const addedRoom = await addIdentityToIdentityListRooms([room], idc);
      if (addedRoom.length === 0) {
        const response: JoinResponseI = {
          status: 'already-added',
          message: `Identity already exists in ${String(jubmojiRoomId)}`,
          roomIds: [jubmojiRoomId]
        };
        res.status(400).json(response);
      } else {
        const response = {
          status: 'valid',
          roomIds: [room.roomId]
        } as JoinResponseI;
        res.status(200).json(response);
      }
    } else {
      res.status(500).json({ status: 'Invalid Proof' });
    }
  })
);

export default router;

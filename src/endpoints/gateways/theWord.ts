import express from 'express';
import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { limiter } from '../middleware';
import asyncHandler from 'express-async-handler';
import { verifyTheWordProof } from '../../gateways/theWord/verifier';
import { addIdentityToIdentityListRooms } from '../../data/db';
import { RoomI } from 'discreetly-interfaces';
import { SNARKProof } from 'idc-nullifier';

const router = express.Router();
const prisma = new PrismaClient();

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
    const { proof, idc } = req.body as { proof: SNARKProof, idc: string };
    const isValid = await verifyTheWordProof(proof);
    if (isValid) {
      const room = await prisma.rooms.findUnique({
        where: {
          roomId: '007' + process.env.THEWORD_ITERATION
        }
      }) as RoomI;
      const addedRoom = await addIdentityToIdentityListRooms([room], idc);
      if (addedRoom.length === 0) {
        res.status(500).json({
          status: 'already-added',
          roomIds: []
        });
      } else {
        res.status(200).json({
          status: 'valid',
          roomIds: [room.roomId]
        });
      }
    } else {
      res.status(500).json({ error: 'Invalid Proof' });
    }
  })
);

export default router;

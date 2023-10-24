import express from 'express';
import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { limiter } from '../middleware';
import asyncHandler from 'express-async-handler';
import { SNARKProof } from '../../types';
import { verifyTheWordProof } from '../../gateways/theWord/verifier';
import { addIdentityToIdentityListRooms } from '../../data/db';
import { RoomI } from 'discreetly-interfaces';

const router = express.Router();
const prisma = new PrismaClient();

router.post(
  '/',
  limiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { proof, idc } = req.body as { proof: SNARKProof; idc: string };

    const isValid = await verifyTheWordProof(proof);
    if (isValid) {
      const room = (await prisma.rooms.findUnique({
        where: {
          roomId: '007' + process.env.THEWORD_ITERATION
        }
      })) as RoomI;
      const addedRoom = await addIdentityToIdentityListRooms([room], idc);
      if (addedRoom.length === 0) {
        res.status(500).json({
          status: 'already-added',
          message: 'Identity already added to room'
        });
      } else {
        res.status(200).json({
          status: 'valid',
          roomId: room.roomId
        });
      }
    } else {
      res.status(500).json({ error: 'Invalid Proof' });
    }
  })
);

export default router;

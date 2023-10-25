import express from 'express';
import type { Request, Response } from 'express';
import { limiter } from '../middleware';
import asyncHandler from 'express-async-handler';
import { verifyIdentityProof } from '../../crypto/idcVerifier/verifier';
import { IDCProof } from 'idc-nullifier/dist/types/types';
import { findRoomsByIdentity } from '../../data/db/';

const router = express.Router();

/** This function gets the rooms that a user is a member of.
 * It takes in the identity commitment of the user, and passes it to the findRoomsByIdentity function.
 * @param {string} idc - The id of the identity to get rooms for.
 * @param {idcProof} proof - The proof of the identity to get rooms for.
 * @returns {void}
 */
router.get(
  '/:idc',
  limiter,
  asyncHandler(async (req: Request, res: Response) => {
    console.log(req.body);
    const isValid = await verifyIdentityProof(req.body as IDCProof);
    console.log('VALID', isValid);
    if (isValid) {
      try {
        res.status(200).json(await findRoomsByIdentity(req.params.idc));
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
      }
    } else {
      res.status(400).json({ error: 'Invalid Proof' });
    }
  })
);

export default router;

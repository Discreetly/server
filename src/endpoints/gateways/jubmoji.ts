import express from 'express';
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { limiter } from '../middleware';
import { generateRandomClaimCode } from 'discreetly-claimcodes';
import basicAuth from 'express-basic-auth';
import { findManyGroups } from '../../data/db';

const router = express.Router();
const prisma = new PrismaClient();

const adminPassword = process.env.PASSWORD
  ? process.env.PASSWORD
  : // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    (generateRandomClaimCode(4) as string);

const adminAuth = basicAuth({
  users: {
    admin: adminPassword
  }
});

// Fetches all jubmoji groups that exist in the database
router.get('/groups/all', adminAuth, (req: Request, res: Response) => {
  findManyGroups('jubmoji')
    .then((groups) => {
      res.status(200).json(groups);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Internal Server Error' });
    });
});

/**
 * This code gets the Jubmoji group with the given address.
 * @param {string} address - The address of the Jubmoji group to get
 * @returns {void}
 * @example {
 *         "address": "string"
 * }
 */
router.get('/group/:address', limiter, (req: Request, res: Response) => {
  const { address } = req.params as { address: string };
    findManyGroups('jubmoji', address)
    .then((groups) => {
      res.status(200).json(groups);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Internal Server Error' });
    });
})


/**
 * This code creates a new Jubmoji group with the given name, and
 * connects the group to the given rooms. It then sends back a JSON
 * response with the newly created Jubmoji group.
 * @param {string} name - The name of the Jubmoji group to create
 * @param {string[]} roomIds - The ids of the rooms to connect to the group
 * @returns {void}
 * @example {
 *        "name": "string",
 *       "roomIds": string[]
 * }
 */
router.post('/group/create', adminAuth, (req: Request, res: Response) => {
  const { name, roomIds } = req.body as { name: string; roomIds: string[] };
  if (!name) res.status(500).json({ error: 'No name provided' });
  prisma.jubmojiGroup
    .create({
      data: {
        name,
        rooms: {
          connect: roomIds.map((roomId) => ({ roomId }))
        }
      }
    })
    .then((group) => {
      res.status(200).json(group);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Internal Server Error' });
    });
})

/**  Adds a list of jubmoji addresses to a list of groups in the database.
 * @param {string[]} names - The names of the Jubmoji groups to add the address to
 * @param {string[]} addresses - The addresses to add to the Jubmoji groups
 */
router.post('/group/add', adminAuth, (req: Request, res: Response) => {
  const { names, addresses } = req.body as { names: string[]; addresses: string[] };

  if (!names) res.status(500).json({ error: 'No name provided' });

  prisma.jubmojiGroup
    .updateMany({
      where: {
        name: {
          in: names
        }
      },
      data: {
        jubmojiAddresses: {
          push: addresses
        }
      }
    })
    .then((group) => {
      res.status(200).json(group);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Internal Server Error' });
    });
})

/** Edits a jubmoji group in the database
 * The body of the request contains the name of the group to edit and the room IDs to associate with the group.
 * @param {string} name - The name of the Jubmoji group to edit
 * @param {string[]} roomIds - The ids of the rooms to connect to the group
 * @returns {void}
 * @example {
 *       "name": "string",
 *      "roomIds": string[]
 * }
 */
router.post('/group/edit', adminAuth, (req: Request, res: Response) => {
  const { name, roomIds } = req.body as { name: string; roomIds: string[] };

  if (!name) res.status(500).json({ error: 'No name provided' });
  prisma.jubmojiGroup.update({
    where: {
      name: name
    },
    data: {
      rooms: {
        connect: roomIds.map((id) => ({ id }))
      }
    }
  }).then((group) => {
    res.status(200).json(group);
  }).catch((err) => {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  })
})

router.post('/group/delete', adminAuth, (req: Request, res: Response) => {
  const { name } = req.body as { name: string };
  prisma.jubmojiGroup.delete({
    where: {
      name: name
    }
  }).then((group) => {
    res.status(200).json(group);
  }).catch((err) => {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  })
})

export default router;

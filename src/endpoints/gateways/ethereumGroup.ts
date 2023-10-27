import asyncHandler from 'express-async-handler';
import type { Request, Response } from 'express';
import express from 'express';
import { limiter } from '../middleware';
import { generateRandomClaimCode } from 'discreetly-claimcodes';
import basicAuth from 'express-basic-auth';
import { addAddressesToEthGroup, updateEthGroup, createEthGroup, findManyEthGroups, findUniqueEthGroup, removeEthGroup, joinRoomsFromEthAddress } from '../../data/db';
import { recoverPublicKey } from '../../data/utils';

const adminPassword = process.env.PASSWORD
  ? process.env.PASSWORD
  : // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    (generateRandomClaimCode(4) as string);

const adminAuth = basicAuth({
  users: {
    admin: adminPassword
  }
});

const router = express.Router();

// Fetches all ethereum groups that exist in the database
router.get('/groups/all', adminAuth, (req: Request, res: Response) => {
    findManyEthGroups()
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
router.get('/group/:address', limiter, (req, res) => {
  const { address } = req.params as { address: string };
  findManyEthGroups(address)
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
router.post(
  '/group/create',
  adminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { name, roomIds } = req.body as {
      name: string;
      roomIds: string[];
    };
    if (!name) res.status(500).json({ error: 'No name provided' })
    const ethereumGroup = await createEthGroup(name, roomIds)
    res.json({ success: true, ethereumGroup });
  })
);

/**  Adds a list of ethereum addresses to a list of groups in the database.
 * @param {string[]} names - The names of the Ethereum groups to add the address to
 * @param {string[]} ethAddresses - The addresses to add to the Ethereum groups
 */
router.post(
  '/group/add',
  adminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { names, ethAddresses } = req.body as {
      names: string[];
      ethAddresses: string[];
    };
    if (!names) res.status(500).json({ error: 'No names provided' });
    try {
      const groups = await addAddressesToEthGroup(names, ethAddresses);
      if (groups.count === 0) {
        res.status(500).json({ error: 'No groups found' });
        return;
      }
      res.json({ success: true, groups });
    } catch (err) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  })
);

/** This code edits an ethereum group in the database.
 *  The body of the request contains the name of the group, the ethereum addresses to associate with the group,
 *  and the room IDs to associate with the group.
 * @param {string} name - The name of the Ethereum group to edit
 * @param {string[]} ethAddresses - The addresses to add to the Ethereum group
 * @param {string[]} roomIds - The ids of the rooms to connect to the group
 * @returns {void}
 * @example {
 *       "name": "string",
 *      "ethAddresses": string[],
 *     "roomIds": string[]
 * }
 */
router.post(
  '/group/edit',
  adminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { name, ethAddresses, roomIds } = req.body as {
      name: string;
      ethAddresses: string[];
      roomIds: [];
    };
    try {
      const foundGroup = await findUniqueEthGroup(name)
      let addresses: string[] = [];

      if (foundGroup?.ethereumAddresses) {
        addresses = ethAddresses.filter((address) => {
          return !foundGroup.ethereumAddresses.includes(address);
        });
      }

      const updatedGroup = await updateEthGroup(name, addresses, roomIds);
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
router.post('/group/delete', adminAuth, (req, res) => {
  const { name } = req.body as { name: string };
  removeEthGroup(name)
    .then((group) => {
      res.status(200).json(group);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Internal Server Error' });
    });
});

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
router.post(
  '/join',
  limiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { message, signature } = req.body as {
      message: string;
      signature: string;
    };

    try {
      const recoveredAddress = recoverPublicKey(message, signature);

      const roomIds = await joinRoomsFromEthAddress(recoveredAddress, message);
      res.json({ status: 'valid', roomIds: roomIds });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  })
);

export default router;

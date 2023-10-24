import asyncHandler from 'express-async-handler';
import type { Request, Response } from 'express';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { limiter } from '../middleware';
import { generateRandomClaimCode } from 'discreetly-claimcodes';
import {
  ecrecover,
  pubToAddress,
  bufferToHex,
  fromRpcSig,
  toBuffer,
  hashPersonalMessage
} from 'ethereumjs-util';
import basicAuth from 'express-basic-auth';

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
const prisma = new PrismaClient();


router.get('/groups/all', adminAuth, (req: Request, res: Response) => {
  prisma.ethereumGroup
    .findMany({
      select: {
        name: true
      }
    })
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
  prisma.ethereumGroup
    .findMany({
      where: {
        ethereumAddresses: {
          has: address
        }
      },
      select: {
        name: true
      }
    })
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
    const ethereumGroup = await prisma.ethereumGroup.create({
      data: {
        name: name,
        rooms: {
          connect: roomIds.map((roomId) => ({ roomId }))
        }
      }
    });
    res.json({ success: true, ethereumGroup });
  })
);

/**  Add a new ethereum address to a group
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
    if (!names) return;
    const groups = await prisma.ethereumGroup.updateMany({
      where: {
        name: {
          in: names
        }
      },
      data: {
        ethereumAddresses: {
          push: ethAddresses
        }
      }
    });
    res.json({ success: true, groups });
  })
);

/** This code creates a new Ethereum group by adding a new entry to the EthereumGroup table in the database.
 *  The body of the request contains the name of the group, the ethereum addresses to associate with the group,
 *  and the room IDs to associate with the group. The code uses Prisma to create a new entry in the EthereumGroup table,
 *  and then returns the newly created group.
 * @param {string} name - The name of the Ethereum group to create
 * @param {string[]} ethAddresses - The addresses to add to the Ethereum groups
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
      const foundGroup = await prisma.ethereumGroup.findUnique({
        where: {
          name: name
        },
        select: {
          ethereumAddresses: true
        }
      });
      let addresses: string[] = [];
      if (foundGroup?.ethereumAddresses) {
        addresses = ethAddresses.filter((address) => {
          return !foundGroup.ethereumAddresses.includes(address);
        });
      }
      const updatedGroup = await prisma.ethereumGroup.update({
        where: {
          name: name
        },
        data: {
          ethereumAddresses: {
            push: addresses
          },
          rooms: {
            connect: roomIds.map((roomId) => ({ roomId }))
          }
        }
      });
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
  prisma.ethereumGroup
    .delete({
      where: {
        name: name
      }
    })
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
  '/message/sign',
  limiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { message, signature } = req.body as {
      message: string;
      signature: string;
    };

    try {
      const msgHex = bufferToHex(Buffer.from(message));
      const msgBuffer = toBuffer(msgHex);
      const msgHash = hashPersonalMessage(msgBuffer);

      const { v, r, s } = fromRpcSig(signature);
      const publicKey = ecrecover(msgHash, v, r, s);
      const address = pubToAddress(publicKey);

      const recoveredAddress = bufferToHex(address);
      const gatewayIdentity = await prisma.gateWayIdentity.upsert({
        where: { semaphoreIdentity: message },
        update: {},
        create: {
          semaphoreIdentity: message
        }
      });

      await prisma.ethereumAddress.upsert({
        where: { ethereumAddress: recoveredAddress },
        update: {},
        create: {
          ethereumAddress: recoveredAddress,
          gatewayId: gatewayIdentity.id
        }
      });

      const roomsToJoin = await prisma.ethereumGroup.findMany({
        where: {
          ethereumAddresses: {
            has: recoveredAddress
          }
        },
        select: {
          roomIds: true
        }
      });

      const roomIdsSet = new Set(roomsToJoin.map((room) => room.roomIds).flat());
      const roomIds = Array.from(roomIdsSet);

      await prisma.gateWayIdentity.update({
        where: { id: gatewayIdentity.id },
        data: { roomIds: { set: roomIds } }
      });

      res.json({ status: 'valid', roomIds: roomIds });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  })
);

export default router;

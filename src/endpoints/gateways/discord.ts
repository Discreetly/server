import express from 'express';
import type { Request, Response } from 'express';
import {  limiter } from '../middleware';
import { PrismaClient } from '@prisma/client';
import { generateRandomClaimCode } from 'discreetly-claimcodes';
import asyncHandler from 'express-async-handler';
import basicAuth from 'express-basic-auth';


const router = express.Router();
const prisma = new PrismaClient();

const discordPassword = process.env.DISCORD_PASSWORD
  ? process.env.DISCORD_PASSWORD
  : // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    (generateRandomClaimCode(4) as string);

const adminAuth = basicAuth({
  users: {
    admin: discordPassword
  }
});

/**
 * Creates a new guild in the database when the bot is added to a discord server.
 * @param {string} guildId - The id of the guild to be added
 * @returns {void}
 */
router.post('/addguild', adminAuth, limiter, (req, res) => {
  const { guildId } = req.body as {
    guildId: string;
  };
  if (!guildId) {
    res.status(400).json({ error: 'Bad Request' });
    return;
  }
  prisma.discord
    .upsert({
      where: {
        discordServerId: guildId
      },
      update: {},
      create: {
        discordServerId: guildId
      }
    })
    .then(() => {
      res.status(200).json({ message: 'Discord guild added successfully' });
      return true;
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Internal Server Error' });
      return false;
    });
});

/**
 *  This code creates a new role-room mapping in the database if one does not already exist,
 *  otherwise it updates the mapping with the new roles.
 * @param {string[]} roles - The roles to be added to the room
 * @param {string} roomId - The id of the room to be added
 * @param {string} guildId - The id of the guild to be added
 * @returns {void}
 */
router.post('/addrole', limiter, adminAuth, (req, res) => {
  const { roles, roomId, guildId } = req.body as {
    roles: string[];
    roomId: string;
    guildId: string;
  };
  if (!roles || !roomId || !guildId) {
    res.status(400).json({ error: 'Bad Request' });
    return;
  }
  prisma.discordRoleRoomMapping
    .upsert({
      where: {
        roomId: roomId
      },
      update: {
        roles: {
          set: roles
        }
      },
      create: {
        roomId: roomId,
        discordServerId: guildId,
        roles: {
          set: roles
        }
      }
    })
    .then(() => {
      res.status(200).json({ message: 'Discord roles added successfully' });
      return true;
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Internal Server Error' });
      return false;
    });
});

/**
 * This code takes the roleId from the request body and tries to find all the rooms that have that role mapped to it.
 *  If it finds any, it returns them as a list in the response body.
 * If it doesn't find any, it returns a 404 error.
 * If it throws an error, it returns a 500 error.
 * @param {string} roleId - The id of the role to be added
 * @param {string} discordId - The id of the discord user
 * @returns {string[]} - An array of room ids
 *  */
router.post(
  '/getrooms',
  limiter,
  adminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { roles, discordId } = req.body as {
      roles: string[];
      discordId: string;
    };
    if (roles.length === 0 || !discordId) {
      res.status(400).json({ error: 'Bad Request' });
      return;
    }
    const rooms = await prisma.gateWayIdentity.findFirst({
      where: {
        discordId: discordId
      },
      include: {
        rooms: true
      }
    });
    if (rooms) {
      const roomIds = rooms.rooms.map((room) => room.roomId);
      const filteredRooms: string[] = [];
      const filteredNames: string[] = [];
      for (const role of roles) {
        const discordRoleRoomMapping =
          await prisma.discordRoleRoomMapping.findMany({
            where: {
              roles: {
                has: role
              }
            }
          });
        const mappingRoomIds = discordRoleRoomMapping.map(
          (mapping) => mapping.roomId
        );
        const newRooms = mappingRoomIds.filter((roomId) =>
          roomIds.includes(roomId)
        );
        const newRoomNames = newRooms.map((roomId) => {
          const room = rooms.rooms.find((room) => room.roomId === roomId);
          return room?.name;
        });
        filteredRooms.push(...newRooms);
        filteredNames.push(...(newRoomNames as string[]));
      }
      console.log(filteredRooms);
      res.status(200).json({ rooms: filteredRooms, roomNames: filteredNames });
    } else {
      const roomIds: string[] = [];

      for (const role of roles) {
        const discordRoleRoomMapping =
          await prisma.discordRoleRoomMapping.findMany({
            where: {
              roles: {
                has: role
              }
            }
          });
        const mappingRoomIds = discordRoleRoomMapping.map(
          (mapping) => mapping.roomId
        );
        roomIds.push(...mappingRoomIds);
      }
      const roomNames = await prisma.rooms.findMany({
        where: {
          roomId: {
            in: roomIds
          }
        },
        select: {
          name: true
        }
      });
      res.status(200).json({
        rooms: roomIds,
        roomNames: roomNames.map((room) => room.name)
      });
    }
  })
);

/**
 * This endpoint takes a discord user id and returns all rooms that the user is a part of.
 * @param {string} discordUserId - The id of the discord user to get rooms for
 * @returns {string[]} - An array of rooms that the user is a part of
 */
router.post('/rooms', limiter, adminAuth, (req, res) => {
  const { discordUserId } = req.body as { discordUserId: string };
  console.log('here');
  prisma.gateWayIdentity
    .findFirst({
      where: {
        discordId: discordUserId
      },
      include: {
        rooms: true
      }
    })
    .then((rooms) => {
      res.status(200).json(rooms);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Internal Server Error' });
    });
});

/**
 * This endpoint gets all the rooms that a user is allowed to access based on their discordId.
 * @params {string} discordId - The id of the discord user to get rooms for
 * @returns {string[]} - An array of rooms that the user is a part of
 */
router.post('/checkrooms', limiter, adminAuth, (req, res) => {
  const { discordId } = req.body as { discordId: string };
  prisma.discordRoleRoomMapping
    .findMany({
      where: {
        discordServerId: discordId
      }
    })
    .then((rooms) => {
      res.status(200).json(rooms);
      return rooms;
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Internal Server Error' });
    });
});

export default router;

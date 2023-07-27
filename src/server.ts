import express from 'express';
import { Server } from 'http';
import { Socket, Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { serverConfig } from './config/rooms.js';
import { type MessageI, genId, RoomI } from 'discreetly-interfaces';
import verifyProof from './verifier.js';

import { pp, shim } from './utils.js';
import mock from './mock.js';
// HTTP is to get info from the server about configuration, rooms, etc
const HTTP_PORT = 3001;
// Socket is to communicate chat room messages back and forth
const SOCKET_PORT = 3002;
const userCount = {};
const app = express();
const socket_server = new Server(app);

shim();

app.use(express.json());
app.use(
  cors({
    origin: '*'
  })
);

const io = new SocketIOServer(socket_server, {
  cors: {
    origin: '*'
  }
});

// Create a MongoClient with a MongoClientOptions object to set the Stable API version

const prisma = new PrismaClient();
console.log('Prisma connected');

function getRoomByID(id: string) {
  return prisma.rooms.findUnique({
    where: {
      roomId: id
    }
  });
}

io.on('connection', (socket: Socket) => {
  pp('SocketIO: a user connected', 'debug');

  socket.on('validateMessage', (msg: MessageI) => {
    pp({ 'VALIDATING MESSAGE ID': msg.id.slice(0, 11), 'MSG:': msg.message });
    let room: RoomI;
    let valid: boolean;
    getRoomByID(msg.room.toString())
      .then((r) => {
        room = r;
      })
      .catch((err) => {
        console.error(err);
      });
    verifyProof(msg, room)
      .then((v) => {
        valid = v;
      })
      .catch((err) => {
        err;
      });
    if (!valid) {
      pp('INVALID MESSAGE', 'warn');
      return;
    }
    io.emit('messageBroadcast', msg);
  });

  socket.on('disconnect', () => {
    pp('SocketIO: user disconnected');
  });

  socket.on('joinRoom', (roomID: bigint) => {
    const id = roomID.toString();
    userCount[id] = userCount[id] ? userCount[id] + 1 : 1;
  });

  socket.on('leaveRoom', (roomID: bigint) => {
    const id = roomID.toString();
    userCount[id] = userCount[id] ? userCount[id] - 1 : 0;
  });
});

app.use(
  cors({
    origin: '*'
  })
);

app.get(['/', '/api'], (req, res) => {
  pp('Express: fetching server info');
  res.json(serverConfig);
});

app.get('/logclaimcodes', async (req, res) => {
  pp('Express: fetching claim codes');
  const claimCodes = await prisma.claimCodes.findMany();
  res.status(200).json(claimCodes);
});

app.get('/identities', async (req, res) => {
  pp(String('Express: fetching all identities'));
  const identities = await prisma.rooms.findMany({
    select: {
      name: true,
      roomId: true,
      identities: true
    }
  });
  res.status(200).json(identities);
});

app.get('/api/rooms', async (req, res) => {
  pp(String('Express: fetching all rooms'));
  const rooms = await prisma.rooms.findMany();
  res.status(200).json(rooms);
});

app.get('/api/rooms/:id', async (req, res) => {
  // TODO This should return the room info for the given room ID
  pp(String('Express: fetching room info for ' + req.params.id));
  const room = await prisma.rooms.findUnique({
    where: {
      roomId: req.params.id
    }
  });
  res.status(200).json(room);
});

app.post('/join', async (req, res) => {
  const data = req.body;
  const { code, idc } = data;
  pp('Express[/join]: claiming code:' + code);
  const claimCode = await prisma.claimCodes.findUnique({
    where: {
      claimcode: code
    }, include: {
      rooms: true
    }
  })
  if (claimCode.claimed === false) {
    await prisma.claimCodes.update({
      where: {
        claimcode: code
      },
      data: {
        claimed: true
      }
    })
    claimCode.rooms.forEach(async (room) => {
      await prisma.rooms.update({
        where: {
          roomId: room.roomId
        },
        data: {
          identities: {
            push: idc
          }
        }
      })
    })
    res.status(201).json({ message: "Claim code successfully claimed" })
  } else {
    res.status(400).json({ message: "Claim code already used" })
  }
});
// TODO api endpoint that creates new rooms and generates invite codes for them

app.post('/room/add', async (req, res) => {
  const data = req.body;
  const { password, roomName } = data;
  if (password === process.env.PASSWORD) {
    const newRoom = await prisma.rooms.create({
      data: {
        roomId: genId(BigInt(999), roomName).toString(),
        name: roomName
      }
    });
    res.status(200).json(newRoom);
  }
});

function initAppListeners() {
  app.listen(HTTP_PORT, () => {
    pp(`Express Http Server is running at port ${HTTP_PORT}`);
  });

  socket_server.listen(SOCKET_PORT, () => {
    pp(`SocketIO Server is running at port ${SOCKET_PORT}`);
  });
}

/**
 * This is the main entry point for the server
 */
if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
  console.log('~~~~DEVELOPMENT MODE~~~~');
  initAppListeners();
  mock(io);
} else {
  initAppListeners();
}

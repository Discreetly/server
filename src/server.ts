import express from 'express';
import { Server } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import cors from 'cors';
import Prisma from 'prisma';
import { PrismaClient } from '@prisma/client';
import { serverConfig, rooms as defaultRooms, rooms } from './config/rooms.js';
import { type MessageI, type RoomI, type RoomGroupI, genId } from 'discreetly-interfaces';
import verifyProof from './verifier.js';
import { generateClaimCodes } from 'discreetly-claimcodes';
import type { ClaimCodeStatus } from 'discreetly-claimcodes';
import { pp } from './utils.js';
import { faker } from '@faker-js/faker';

// HTTP is to get info from the server about configuration, rooms, etc
const HTTP_PORT = 3001;
// Socket is to communicate chat room messages back and forth
const SOCKET_PORT = 3002;

// Deal with bigints in JSON
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const app = express();

const socket_server = new Server(app);
app.use(express.json());

const io = new SocketIOServer(socket_server, {
  cors: {
    origin: '*'
  }
});

interface userCountI {
  [key: string]: number;
}

let userCount: userCountI = {};
let loadedRooms: RoomGroupI[];
let TESTGROUPID: BigInt;

let redisClient;
let TESTING = false;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version

const prisma = new PrismaClient();
console.log("Prisma connected");


io.on('connection', (socket: Socket) => {
  pp('SocketIO: a user connected', 'debug');

  socket.on('validateMessage', (msg: MessageI) => {
    pp({ 'VALIDATING MESSAGE ID': msg.id.slice(0, 11), 'MSG:': msg.message });
    const valid = verifyProof(msg, loadedRooms);
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
})


app.get('/identities', async (req, res) => {
  pp(String("Express: fetching all identities"))
  const identities = await prisma.rooms.findMany({
    select: {
      name: true,
      roomId: true,
      identities: true
    }
  })
  res.status(200).json(identities);
})


app.get('/api/rooms', async (req, res) => {
  pp(String("Express: fetching all rooms"))
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
  const codeStatus = await prisma.claimCodes.findUnique({
    where: {
      claimcode: code
    }
  })
  if (codeStatus.claimed === false) {
    const claimCode = await prisma.claimCodes.update({
      where: {
        claimcode: code
      },
      data: {
        claimed: true
      }
    })
    const roomIds = claimCode["roomIds"].map((room) => room);
    const updatedRooms = await prisma.rooms.updateMany({
      where: {
        roomId: {
          in: roomIds
        }
      },
      data: {
        identities: {
          push: idc
        }
      }
    })
    res.status(200).json(updatedRooms);
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
    })
    res.status(200).json(newRoom)
  }
});





app.listen(HTTP_PORT, () => {
  pp(`Express Http Server is running at port ${HTTP_PORT}`);
});

socket_server.listen(SOCKET_PORT, () => {
  pp(`SocketIO Server is running at port ${SOCKET_PORT}`);
});


if (TESTING) {
  class randomMessagePicker {
    values: any;
    weightSums: any[];
    constructor(values, weights) {
      this.values = values;
      this.weightSums = [];
      let sum = 0;

      for (let weight of weights) {
        sum += weight;
        this.weightSums.push(sum);
      }
    }

    pick() {
      const rand = Math.random() * this.weightSums[this.weightSums.length - 1];
      let index = this.weightSums.findIndex((sum) => rand < sum);
      return this.values[index]();
    }
  }

  const values = [
    faker.finance.ethereumAddress,
    faker.company.buzzPhrase,
    faker.lorem.sentence,
    faker.hacker.phrase
  ];
  const weights = [1, 3, 2, 8];
  const picker = new randomMessagePicker(values, weights);

  setInterval(() => {
    const message: MessageI = {
      id: faker.number.bigInt().toString(),
      room: BigInt('7458174823225695762087107782399226439860424529052640186229953289032606624581'),
      message: picker.pick(),
      timestamp: Date.now().toString(),
      epoch: Math.floor(Date.now() / 10000)
    };
    console.log('SENDING TEST MESSAGE');
    io.emit('messageBroadcast', message);
  }, 10000);
}

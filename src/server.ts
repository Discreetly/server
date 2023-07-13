import express from 'express';
import { Server } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import cors from 'cors';
import { createClient } from 'redis';
import { serverConfig, rooms as defaultRooms, rooms } from './config/rooms.js';
import type { MessageI, RoomI, RoomGroupI } from 'discreetly-interfaces';
import verifyProof from './verifier.js';
import { ClaimCodeManager } from 'discreetly-claimcodes';
import type { ClaimCodeStatus } from 'discreetly-claimcodes';
import { pp, addIdentityToRoom, createGroup, createRoom, findGroupById } from './utils.js';
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

if (!process.env.REDIS_URL) {
  console.log('Connecting to redis at localhost');
  redisClient = createClient();
  TESTING = true;
} else {
  console.log('Connecting to redis at: ' + process.env.REDIS_URL);
  redisClient = createClient({
    url: process.env.REDIS_URL,
    socket: {
      tls: true,
      rejectUnauthorized: false
    }
  });
}
redisClient.connect().then(() => pp('Redis Connected'));

redisClient.get('rooms').then((rooms) => {
  rooms = JSON.parse(rooms);
  if (rooms) {
    loadedRooms = rooms as unknown as RoomGroupI[];
  } else {
    loadedRooms = defaultRooms;
    redisClient.set('rooms', JSON.stringify(loadedRooms));
  }
});

let ccm: ClaimCodeManager;

redisClient.get('ccm').then((cc) => {
  TESTGROUPID = BigInt(loadedRooms[0].id);
  if (!cc) {
    ccm = new ClaimCodeManager();
    ccm.generateClaimCodeSet(10, TESTGROUPID, 'TEST');
    const ccs = ccm.getClaimCodeSets();
    redisClient.set('ccm', JSON.stringify(ccs));
  } else {
    ccm = new ClaimCodeManager(JSON.parse(cc));

    if (ccm.getUsedCount(TESTGROUPID).unusedCount < 5) {
      ccm.generateClaimCodeSet(10, TESTGROUPID, 'TEST');
      const ccs = ccm.getClaimCodeSets();

      redisClient.set('ccm', JSON.stringify(ccs));
    }
  }
  const ccs = ccm.getClaimCodeSets();
});

redisClient.on('error', (err) => pp('Redis Client Error: ' + err, 'error'));

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

app.get('/api/rooms', (req, res) => {
  pp('Express: fetching rooms');
  res.json(loadedRooms);
});

app.get('/api/rooms/:id', (req, res) => {
  // TODO This should return the room info for the given room ID
  pp(String('Express: fetching room info for ' + req.params.id));
  const room = loadedRooms
    .flatMap((rooms) => rooms.rooms)
    .filter((room) => room.id === req.params.id);
  res.json(room);
});

// TODO api endpoint that creates new rooms and generates invite codes for them
app.post('/join', (req, res) => {
  const data = req.body;
  const { code, idc } = data;
  pp('Express[/join]: claiming code:' + code);
  const result: ClaimCodeStatus = ccm.claimCode(code);
  const groupID = result.groupID;
  if (result.status === 'CLAIMED') {
    let claimedRooms = [];
    let alreadyAddedRooms = [];
    loadedRooms.forEach((group) => {
      if (group.id == groupID) {
        group.rooms.forEach((room: RoomI) => {
          let { status, roomGroups } = addIdentityToRoom(BigInt(room.id), BigInt(idc), loadedRooms);
          loadedRooms = roomGroups;
          redisClient.set('rooms', JSON.stringify(loadedRooms));
          if (status) {
            claimedRooms.push(room);
          } else {
            alreadyAddedRooms.push(room);
          }
        });
      }
    });
    let r = [...claimedRooms, ...alreadyAddedRooms];

    if (claimedRooms.length > 0) {
      res.status(200).json({ status: 'valid', rooms: r });
    } else if (alreadyAddedRooms.length > 0) {
      res.status(200).json({ status: 'already-added', rooms: r });
    } else {
      res.status(451).json({ status: 'invalid' });
    }

    // the DB should be updated after we successfully send a response
    redisClient.set('ccm', JSON.stringify(ccm.getClaimCodeSets()));
  } else {
    res.status(451).json({ status: 'invalid' });
  }
});

// TODO we are going to need endpoints that take a password that will be in a .env file to generate new roomGroups, rooms, and claim codes
app.post('/group/add', (req, res) => {
  const data = req.body;
  const { password, groupName, roomNames, codes } = data;
  if (password === process.env.PASSWORD) {
    const result = createGroup(groupName, roomNames, loadedRooms);
    loadedRooms = result.roomGroup;
    redisClient.set('rooms', JSON.stringify(loadedRooms));
    if (codes.generate) {
      codes.amount = codes.amount || 10;
      ccm.generateClaimCodeSet(codes.amount, result.groupId, groupName);
      const ccs = ccm.getClaimCodeSets();
      redisClient.set('ccm', JSON.stringify(ccs));
    }
    res.status(201).json({ status: `Created group ${groupName}`, loadedRooms });
  }
});

app.post('/room/add', (req, res) => {
  const data = req.body;
  const { password, groupId, roomName } = data;
  if (password === process.env.PASSWORD) {
    const roomGroups = createRoom(groupId, roomName, loadedRooms);
    loadedRooms = roomGroups;
    redisClient.set('rooms', JSON.stringify(loadedRooms));
    res.status(201).json({ status: `Created room ${roomName}`, loadedRooms });
  }
});

app.post('/group/createcode', (req, res) => {
  const data = req.body;
  let { password, groupId, amount } = data;
  if (password === process.env.PASSWORD) {
    amount = amount || 10;
    console.log(loadedRooms, groupId);
    const group = findGroupById(loadedRooms, groupId);
    const ccs = ccm.generateClaimCodeSet(amount, groupId, group.name);
    redisClient.set('ccm', JSON.stringify(ccs));
    res.status(201).json({ stats: `Created ${amount} codes for ${group.name}`, ccm });
  }
});

app.get('/logclaimcodes', (req, res) => {
  pp('-----CLAIMCODES-----', 'debug');
  pp(ccm.getClaimCodeSet(TESTGROUPID));
  pp('-----ENDOFCODES-----', 'debug');
  res.status(200).json({ status: 'ok' });
});

app.listen(HTTP_PORT, () => {
  pp(`Express Http Server is running at port ${HTTP_PORT}`);
});

socket_server.listen(SOCKET_PORT, () => {
  pp(`SocketIO Server is running at port ${SOCKET_PORT}`);
});

// Disconnect from redis on exit
process.on('SIGINT', () => {
  pp('disconnecting redis');
  redisClient.disconnect().then(process.exit());
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

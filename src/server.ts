import * as express from 'express';
import { Server } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import * as cors from 'cors';
import { createClient } from 'redis';
import { serverConfig, rooms as defaultRooms, rooms } from '../config/rooms';
import { MessageI, RoomGroupI } from 'discreetly-interfaces';
import verifyProof from './verifier';
import ClaimCodeManager from 'discreetly-claimcodes';

// Deal with bigints in JSON
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

// HTTP is to get info from the server about configuration, rooms, etc
const http_port = 3001;
// Socket is to communicate chat room messages back and forth
const socket_port = 3002;

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
// TODO get the claim code manager working with redis to store the state of the rooms and claim codes in a redis database that persists across server restarts
// Redis

const redisClient = createClient();
redisClient.connect().then(() => console.log('Redis Connected'));

let ccm: ClaimCodeManager;

redisClient.get('ccm').then((cc) => {
  if (!cc) {
    ccm = new ClaimCodeManager();
    ccm.generateClaimCodeSet(10, 999, 'TEST');
    const ccs = ccm.getClaimCodeSets();
    redisClient.set('ccm', JSON.stringify(ccs));
  } else {
    ccm = new ClaimCodeManager(JSON.parse(cc));
    if (ccm.getUsedCount(999).unusedCount < 5) {
      ccm.generateClaimCodeSet(10, 999, 'TEST');
      const ccs = ccm.getClaimCodeSets();
      redisClient.set('ccm', JSON.stringify(ccs));
    }
  }
});

redisClient.get('ccm').then((res) => console.log(res));

redisClient.get('rooms').then((rooms) => {
  rooms = JSON.parse(rooms);
  if (rooms) {
    console.log('Rooms', rooms);
    loadedRooms = rooms as RoomGroupI[];
  } else {
    loadedRooms = defaultRooms;
    redisClient.set('rooms', JSON.stringify(loadedRooms));
  }
  console.log('Loaded Rooms:', loadedRooms);
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));

io.on('connection', (socket: Socket) => {
  console.debug('a user connected');

  socket.on('validateMessage', (msg: MessageI) => {
    console.log('VALIDATING MESSAGE ID:', msg.id.slice(0, 11), 'MSG:', msg.message);
    const timestamp = Date.now().toString();
    const valid = verifyProof(msg);
    if (!valid) {
      console.log('INVALID MESSAGE');
      return;
    }
    io.emit('messageBroadcast', msg);
  });

  socket.on('disconnect', () => {
    console.log('user disconnected');
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
  console.log('fetching server info');
  res.json(serverConfig);
});

app.get('/api/rooms', (req, res) => {
  console.log('fetching rooms');
  res.json(loadedRooms);
});

app.get('/api/rooms/:id', (req, res) => {
  // TODO This should return the room info for the given room ID
  console.log('fetching room info', req.params.id);
  console.log(loadedRooms);
});

// TODO api endpoint that creates new rooms and generates invite codes for them

app.post('/join', (req, res) => {
  const { code, idc } = req.body;
  console.log('claiming code:', code, 'with identityCommitment', idc);
  // TODO This is where we would validate the claim/invite code
  // TODO the `result` is in this format: https://github.com/AtHeartEngineering/Discreetly/blob/f2ea89d4b87004693985854e17a4e669177c4df3/packages/claimCodes/src/manager.ts#L10
  const result = ccm.claimCode(code);
  if (result.status === 'CLAIMED') {
    // join room
    // update redis with new code status
    redisClient.set('ccm', JSON.stringify(ccm.getClaimCodeSets()));
    console.log('Code claimed');
  } else {
    console.error('Code already claimed');
  }
  // TODO The `groupID` is the room ID like in https://github.com/AtHeartEngineering/Discreetly/blob/acc670fc4c43aa545dbbd03817879abfe5bc819e/packages/server/config/rooms.ts#L37
  // TODO If the claim code is valid, then we would add the user to the room
  // const identityCommitment = data.identityCommitment; // FIX this is the identity commitment from the user, think of it as a user ID
  res.status(200).json({ code });
});

app.listen(http_port, () => {
  console.log(`Http Server is running at http://localhost:${http_port}`);
});

socket_server.listen(socket_port, () => {
  console.log(`Socket Server is running at http://localhost:${socket_port}`);
});

// // Disconnect from redis on exit
// process.on('SIGINT', () => {
//   console.log('disconnecting redis');
//   redisClient.disconnect().then(process.exit());
// });

import { serverConfig, rooms as defaultRooms, rooms } from './config/rooms.js';
import type { MessageI, RoomI, RoomGroupI } from 'discreetly-interfaces';
import { ClaimCodeManager } from 'discreetly-claimcodes';
import type { ClaimCodeStatus } from 'discreetly-claimcodes';
import { pp, addIdentityToRoom, createGroup, createRoom, findGroupById } from './utils.js';
import { Socket, Server as SocketIOServer } from 'socket.io';
import { RedisClientType } from 'redis';
import verifyProof from './verifier.js';
import { userCountI } from './types.js';

export async function initRedisVariables(redisClient: RedisClientType): Promise<{
  loadedRooms: RoomGroupI[];
  ccm: ClaimCodeManager;
  TESTGROUPID: bigint;
}> {
  let loadedRooms: RoomGroupI[];

  const _CachedRooms = await redisClient.get('rooms');
  if (rooms) {
    console.log('Loading cached rooms');
    loadedRooms = JSON.parse(_CachedRooms) as unknown as RoomGroupI[];
  } else {
    console.log('Using default rooms');
    loadedRooms = defaultRooms as RoomGroupI[];
    redisClient.set('rooms', JSON.stringify(loadedRooms));
  }

  let claimCodeManager: ClaimCodeManager;
  let TESTGROUPID: bigint;
  const _CachedClaimCodeManager = await redisClient.get('ccm');
  TESTGROUPID = BigInt(loadedRooms[0].id);
  if (!_CachedClaimCodeManager) {
    claimCodeManager = new ClaimCodeManager();
    claimCodeManager.generateClaimCodeSet(10, TESTGROUPID, 'TEST');
    const ccs = claimCodeManager.getClaimCodeSets();
    redisClient.set('ccm', JSON.stringify(ccs));
  } else {
    claimCodeManager = new ClaimCodeManager(JSON.parse(_CachedClaimCodeManager));

    if (claimCodeManager.getUsedCount(TESTGROUPID).unusedCount < 5) {
      claimCodeManager.generateClaimCodeSet(10, TESTGROUPID, 'TEST');
      const ccs = claimCodeManager.getClaimCodeSets();

      redisClient.set('ccm', JSON.stringify(ccs));
    }
  }

  return { loadedRooms, ccm: claimCodeManager, TESTGROUPID };
}

export function initSockets(io: SocketIOServer, loadedRooms: RoomGroupI[]) {
  let userCount: userCountI = {};
  io.on('connection', (socket: Socket) => {
    pp('SocketIO: a user connected', 'debug');

    socket.on('validateMessage', (msg: MessageI) => {
      pp({ 'VALIDATING MESSAGE ID': msg.id?.slice(0, 11), 'MSG:': msg.message });
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
}

export function initExpressEndpoints(
  app,
  redisClient: RedisClientType,
  ccm: ClaimCodeManager,
  TESTGROUPID: bigint
) {
  let loadedRooms: RoomGroupI[] = rooms;
  app.get(['/', '/api'], (req, res) => {
    pp('Express: fetching server info');
    res.json(serverConfig);
  });

  app.get('/api/rooms', (req, res) => {
    pp('Express: fetching rooms');
    redisClient.get('rooms').then((rooms) => {
      return res.json(rooms);
    });
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
      let claimedRooms: any[] = [];
      let alreadyAddedRooms: any[] = [];
      loadedRooms.forEach((group) => {
        if (group.id == groupID) {
          group.rooms.forEach((room: RoomI) => {
            let { status, roomGroups } = addIdentityToRoom(
              BigInt(room.id),
              BigInt(idc),
              loadedRooms
            );
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
    res.status(401).json({ status: 'Unauthorized' });
  });

  app.post('/room/add', (req, res) => {
    const data = req.body;
    const { password, groupId, roomName } = data;
    if (password === process.env.PASSWORD) {
      redisClient.get('rooms').then((loadedRooms) => {
        const roomGroups = createRoom(groupId, roomName, JSON.parse(loadedRooms) as RoomGroupI[]);
        redisClient.set('rooms', JSON.stringify(roomGroups));
        res.status(201).json({ status: `Created room ${roomName}`, roomGroups });
      });
    }
    res.status(401).json({ status: 'Unauthorized' });
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
}

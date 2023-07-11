import { createClient } from 'redis';
import { RoomGroupI, ServerI, genId } from 'discreetly-interfaces';


const redisClient = createClient();
redisClient.connect();

export const findRoomById = (rooms, id) => {
  for (let i = 0; i < rooms.length; i++) {
    const nestedRooms = rooms[i].rooms;
    for (let j = 0; j < nestedRooms.length; j++) {
      if (nestedRooms[j].id === id) {
        console.log('FOUND ROOM');
        return nestedRooms[j];
      } else {
        console.log(`Room with id:${id} not found`);
      }
    }
  }
};

export const findGroupById = (rooms, groupId) => {
  for (let i = 0; i < rooms.length; i++) {
    if (rooms[i].id === groupId) {
      const group = rooms[i];
      return group;
    }
  }
};

export const addIdentityToRoom = (groupId, identityCommitment) => {
  redisClient.get('rooms').then((res) => {
    const data = JSON.parse(res);
    const group = findGroupById(data, groupId);
    if (group) {
      const groupIndex = data.findIndex((gIdx) => gIdx.name === group.name);
      if (groupIndex === -1) {
        console.error('Group not found');
      } else {
        data[groupIndex].rooms.forEach((room) => {
          if (!room.membership.identityCommitments.find((id) => id === identityCommitment)) {
            room.membership.identityCommitments.push(identityCommitment);
            console.log(`Identity set in room ${room.name}`);
            redisClient.set('rooms', JSON.stringify(data));
          } else {
            console.error(`Identity already exists in room ${room.name}`);
          }
        });
      }
    } else {
      console.error('Group not found');
    }
  });
};

export const createGroup = (groupName, roomNames) => {
  const newGroup: RoomGroupI = {
    id: genId(BigInt(999), groupName),
    name: groupName,
    rooms: roomNames.map(roomName => {
      return {
        id: genId(BigInt(999), roomName),
        name: roomName,
        membership: { identityCommitments: [] },
        rateLimit: 1000
      }
    })
  }
  redisClient.get('rooms').then(groups => {
    const data = JSON.parse(groups);
    data.push(newGroup);
    redisClient.set('rooms', JSON.stringify(data));
    pp(`Group ${groupName} created`);
  });
}

// Pretty Print to console
export const pp = (str: any, level = 'log') => {
  str = JSON.stringify(str, null, 2);
  switch (level) {
    case 'log':
      console.log(str);
      break;
    case 'debug':
      console.debug(str);
      break;
    case 'info':
      console.info(str);
      break;
    case 'warn' || 'warning':
      console.warn(str);
      break;
    case 'error' || 'err':
      console.error(str);
      break;
    case 'table':
      console.table(str);
      break;
    case 'assert':
      console.assert(str);
    default:
      console.log(str);
  }
};

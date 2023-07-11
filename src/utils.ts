import { createClient } from 'redis';
import type { RoomI, RoomGroupI, ServerI } from 'discreetly-interfaces';
import { genId } from 'discreetly-interfaces';

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

export const findGroupById = (roomGroups: RoomGroupI[], groupId: BigInt): RoomGroupI => {
  const group = roomGroups.find((group) => group.id === groupId);
  if (!group) {
    console.error('Group not found');
  } else {
    return group;
  }
};

export const addIdentityToRoom = (
  roomID: BigInt,
  identityCommitment: BigInt,
  roomGroups: RoomGroupI[]
): { status: Boolean; roomGroups: RoomGroupI[] } => {
  let added = false;
  roomGroups.forEach((group, groupIndex) => {
    group.rooms.forEach((room, roomIndex) => {
      if (BigInt(room.id) == roomID) {
        if (room.membership.identityCommitments.includes(identityCommitment)) {
          console.log('Identity already in room');
        }
        roomGroups[groupIndex].rooms[roomIndex].membership.identityCommitments.push(
          identityCommitment
        );
        pp(roomGroups);

        console.log(`IdentityCommitment ${identityCommitment} added to room ${roomID}`);
        added = true;
      }
    });
  });
  return { status: added, roomGroups: roomGroups };
};

export const createGroup = (groupName, roomNames) => {
  const newGroup: RoomGroupI = {
    id: genId(BigInt(999), groupName),
    name: groupName,
    rooms: roomNames.map((roomName) => {
      return {
        id: genId(BigInt(999), roomName),
        name: roomName,
        membership: { identityCommitments: [] },
        rateLimit: 1000
      };
    })
  };
  redisClient.get('rooms').then((groups) => {
    const data = JSON.parse(groups);
    data.push(newGroup);
    redisClient.set('rooms', JSON.stringify(data));
    pp(`Group ${groupName} created`);
  });
};

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

import { createClient } from 'redis';
import type { RoomI, RoomGroupI, ServerI } from 'discreetly-interfaces';
import { genId } from 'discreetly-interfaces';

const redisClient = createClient();
redisClient.connect();

export function findRoomById(
  roomGroups,
  roomID
): { room: RoomI; groupIndex: number; roomIndex: number } | undefined {
  roomGroups.forEach((group, groupIndex) => {
    group.rooms.forEach((room, roomIndex) => {
      if (BigInt(room.id) == roomID) {
        return { room, groupIndex, roomIndex };
      }
    });
  });
  return undefined;
}

export function findGroupById(roomGroups: RoomGroupI[], groupId: BigInt): RoomGroupI {
  const group = roomGroups.find((group) => group.id === groupId);
  console.log(roomGroups, groupId);
  if (!group) {
    console.error('Group not found');
  } else {
    return group;
  }
}

export function addIdentityToRoom(
  roomID: bigint,
  identityCommitment: bigint,
  roomGroups: RoomGroupI[]
): { status: Boolean; roomGroups: RoomGroupI[] } {
  let added = false;
  const r = findRoomById(roomGroups, roomID);

  if (r) {
    if (r.room.membership.identityCommitments.includes(identityCommitment)) {
      console.log('Identity already in room');
    } else {
      roomGroups[r.groupIndex].rooms[r.roomIndex].membership.identityCommitments.push(
        identityCommitment
      );
      console.log(`IdentityCommitment ${identityCommitment} added to room ${roomID}`);
      added = true;
    }
  }
  return { status: added, roomGroups: roomGroups };
}

export function createGroup(
  groupName: string,
  roomNames: string[],
  roomGroups: RoomGroupI[]
): { groupId: bigint, roomGroup: RoomGroupI[] } {
  const newGroup: RoomGroupI = {
    id: genId(BigInt(999), groupName).toString() as unknown as bigint,
    name: groupName,
    rooms: roomNames.map((roomName) => {
      return {
        id: genId(BigInt(999), roomName).toString() as unknown as bigint,
        name: roomName,
        membership: { identityCommitments: [] },
        rateLimit: 1000
      };
    })
  };
  roomGroups.push(newGroup);
  return { groupId: newGroup.id, roomGroup: roomGroups };
}

export function createRoom(
  groupId: bigint,
  roomName: string,
  roomGroups: RoomGroupI[]): RoomGroupI[] {
  const newRoom: RoomI = {
    id: genId(BigInt(999), roomName),
    name: roomName,
    membership: { identityCommitments: [] },
    rateLimit: 1000
  }
  const groupIndex = roomGroups.findIndex(group => group.id === groupId);
  if (groupIndex !== -1) {
    roomGroups[groupIndex].rooms.push(newRoom);
  }
  return roomGroups;
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

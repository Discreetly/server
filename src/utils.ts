import { createClient } from 'redis';

const redisClient = createClient();
redisClient.connect();

export const findRoomById = (rooms, id) => {
  for (let i = 0; i < rooms.length; i++) {
    const nestedRooms = rooms[i].rooms;
    for (let j = 0; j < nestedRooms.length; j++) {
      if (nestedRooms[j].id === id) {
        console.log("FOUND ROOM")
        return nestedRooms[j];
      } else {
        console.log(`Room with id:${id} not found`)
      }
    }
  }
}


export const addIdentityToRoom = (groupId, IdentityCommitment) => {
  redisClient.get('rooms').then((res) => {
    const data = JSON.parse(res);
    const roomIndex = data[0].rooms.findIndex((room) => room.id === groupId);
    const roomToAdd = data[0].rooms[roomIndex];
    // console.log(roomToAdd.membership.identityCommitments.find(identity => identity === idc));
    if (
      !roomToAdd.membership.identityCommitments.find((identity) => identity === IdentityCommitment)
    ) {
      roomToAdd.membership.identityCommitments.push(IdentityCommitment);
      const updatedRooms = JSON.stringify(data);
      redisClient.set('rooms', updatedRooms);
    } else {
      console.log('Identity already exists in room');
    }
  });
};

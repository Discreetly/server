import { createClient } from 'redis';

const redisClient = createClient();
redisClient.connect();

export const addIdentityToRoom = (id, IdentityCommitment) => {
  redisClient.get('rooms').then(res => {
    const data = JSON.parse(res);
    const roomIndex = data[0].rooms.findIndex(room => room.id === id);
    const roomToAdd = data[0].rooms[roomIndex];
    // console.log(roomToAdd.membership.identityCommitments.find(identity => identity === idc));
    if (!roomToAdd.membership.identityCommitments.find(identity => identity === IdentityCommitment)) {
      roomToAdd.membership.identityCommitments.push(IdentityCommitment);
      const updatedRooms = JSON.stringify(data);
      redisClient.set('rooms', updatedRooms)
      console.log('Successfully added identity');
    } else {
      console.log('Identity already exists in room');
    }
  })
}


export const getGroupId = (claimCode) => {
  redisClient.get('ccm').then(cc => {
    const data = JSON.parse(cc);
    for (const group in data) {
      const codes = data[group].claimCodes;
      for (const claim of codes) {
        if (claim.code === claimCode) {
          console.log("GROUPID", data[group].groupID);
        }
      }
    }
  });
}

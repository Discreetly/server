import { getRoomByID } from "./db";
import { PrismaClient } from '@prisma/client'
import { MessageI } from 'discreetly-interfaces'


const prisma = new PrismaClient();


// const testRoomId = '20945462742745557191488383979949684808523754877925170533224967224808050898610'
// const testIdentity = '14190528236246017918200035567042171677174421028127319624115381263123381401333'
// const testMessage = {
//   meesage: "New Message",
//   messageId: '92047824095782849075874',
//   proof: genProof(await getRoomByID(testRoomId), testIdentity, 1),
//   roomId: testRoomId
// }

function updateRoom(roomId: string, message: MessageI): Promise<any> {
  return prisma.rooms.update({
    where: {
      roomId: roomId
    },
    data: {
      epochs: {
        create: {
          epoch: +message.epoch.toString(),
          messages: {
            create: {
              message: message.message,
              messageId: message.messageId,
              proof: JSON.stringify(message.proof),
              roomId: roomId
            }
          }
        }
      }
    }
  });
}

export function createMessage(roomId: string, message: MessageI) {
  getRoomByID(roomId)
    .then(room => {
      if (room) {
        updateRoom(roomId, message)
          .then(roomToUpdate => {
            console.log(roomToUpdate);
          })
          .catch(error => {
            console.error(`Error updating room: ${error}`);
          });
      } else {
        console.log("Room not found");
      }
    })
    .catch(error => {
      console.error(`Error getting room: ${error}`);
    });
}

import { MessageI, RoomI } from 'discreetly-interfaces';
import { Socket, Server as SocketIOServer } from 'socket.io';
import { findRoomById, createSystemMessages } from '../data/db/';
import { pp } from '../utils';
import { validateMessage } from '../data/messages';
import type { validateMessageResult } from '../data/messages';
const userCount: Record<string, number> = {};

export function websocketSetup(io: SocketIOServer) {
  io.on('connection', (socket: Socket) => {
    pp('SocketIO: a user connected', 'debug');

    socket.on('validateMessage', async (msg: MessageI) => {
      try {
        const room: RoomI | null = await findRoomById(String(msg.roomId));
        if (!room) {
          pp('INVALID ROOM', 'warn');
          return;
        }
        const validMessage: validateMessageResult = await validateMessage(room, msg);
        if (validMessage.success) {
          // Send messages to only users who are listening to that room
          io.to(room.roomId.toString()).emit('messageBroadcast', msg);
        } else {
          pp('INVALID MESSAGE', 'warn');
          return;
        }
      } catch (err) {
        pp(err, 'error');
      }
    });

    socket.on('disconnect', () => {
      pp('SocketIO: user disconnected');
    });

    socket.on('joiningRoom', (roomID: string) => {
      userCount[roomID] = userCount[roomID] ? userCount[roomID] + 1 : 1;
      void socket.join(roomID);
      io.to(roomID).emit('Members', userCount[roomID] ? userCount[roomID] : 0);
    });

    socket.on('leavingRoom', (roomID: string) => {
      void socket.leave(roomID);
      userCount[roomID] = userCount[roomID] ? userCount[roomID] - 1 : 0;
      io.to(roomID).emit('Members', userCount[roomID] ? userCount[roomID] : 0);
    });

    // TODO We need to rewrite this so it doesn't use `socket.on`, because this allows anyone to be able to broadcast a system message to any room.
    // socket.on('systemMessage', (msg: string, roomID: bigint) => {
    //   const id = roomID.toString();
    //   createSystemMessages(msg, id)
    //     .then(() => {
    //       if (roomID) {
    //         io.to(id).emit('systemMessage', msg);
    //       } else {
    //         io.emit('systemMessage', msg);
    //       }
    //     })
    //     .catch((err) => {
    //       pp(err, 'error');
    //     });
    // });
  });
}

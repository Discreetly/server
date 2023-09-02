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
          io.emit('messageBroadcast', msg);
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

    socket.on('joinRoom', (roomID: bigint) => {
      const id = roomID.toString();
      userCount[id] = userCount[id] ? userCount[id] + 1 : 1;
      void socket.join(id);
      io.to(id).emit('Members', userCount[id] ? userCount[id] : 0);
    });

    socket.on('leaveRoom', (roomID: bigint) => {
      const id = roomID.toString();
      userCount[id] = userCount[id] ? userCount[id] - 1 : 0;
      io.to(id).emit('Members', userCount[id] ? userCount[id] : 0);
    });

    socket.on('systemMessage', (msg: string, roomID: bigint) => {
      const id = roomID.toString();
      createSystemMessages(msg, id)
        .then(() => {
          if (roomID) {
            io.to(id).emit('systemMessage', msg);
          } else {
            io.emit('systemMessage', msg);
          }
        })
        .catch((err) => {
          pp(err, 'error');
        });
    });
  });
}

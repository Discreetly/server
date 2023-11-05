import { MessageI, RoomI } from 'discreetly-interfaces';
import { Socket, Server as SocketIOServer } from 'socket.io';
import { findRoomById } from '../data/db/';
import { pp } from '../utils';
import { validateMessage } from '../data/messages';
import type { validateMessageResult } from '../data/messages';

function getAllActiveRooms(io: SocketIOServer) {
  // This function should return an array of all active room names
  // Depending on your application's logic, this may vary
  const rooms: string[] = [];
  io.sockets.adapter.rooms.forEach((value, key) => {
    // Check if the key does not start with a socket ID, which means it's a room
    rooms.push(key);
  });
  return rooms;
}

function getNumberOfClientsInRoom(io: SocketIOServer, room: string) {
  const roomObj = io.sockets.adapter.rooms.get(room);
  return roomObj ? roomObj.size : 0;
}

export function websocketSetup(io: SocketIOServer): NodeJS.Timer {
  io.on('connection', (socket: Socket) => {
    pp('SocketIO: a user connected', 'debug');

    socket.on('validateMessage', async (msg: MessageI) => {
      msg.sessionId = socket.id;
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

    socket.on('joiningRoom', (roomID: string) => {
      void socket.join(roomID);
      const room = io.sockets.adapter.rooms.get(roomID);
      const numberOfClients = room ? room.size : 0;
      io.to(roomID).emit('Members', numberOfClients);
    });

    socket.on('leavingRoom', (roomID: string) => {
      void socket.leave(roomID);
      const numberOfClients = getNumberOfClientsInRoom(io, roomID);
      io.to(roomID).emit('Members', numberOfClients);
    });
  });
  return setInterval(() => {
    io.emit('TotalMembers', io.engine.clientsCount);
    const rooms = getAllActiveRooms(io);
    rooms.forEach((roomID) => {
      const numberOfClients = getNumberOfClientsInRoom(io, roomID);
      io.to(roomID).emit('Members', numberOfClients);
    });
  }, 30000);
}

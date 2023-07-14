import express from 'express';
import { Server } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { createClient } from 'redis';
import { pp, shim } from './utils.js';
import { initRedisVariables, initSockets, initExpressEndpoints } from './startup.js';
import mock from './mock.js';
// HTTP is to get info from the server about configuration, rooms, etc
const HTTP_PORT = 3001;
// Socket is to communicate chat room messages back and forth
const SOCKET_PORT = 3002;

const app = express();
const socket_server = new Server(app);

shim();

app.use(express.json());
app.use(
  cors({
    origin: '*'
  })
);

const io = new SocketIOServer(socket_server, {
  cors: {
    origin: '*'
  }
});

let redisClient;

function initAppListeners() {
  app.listen(HTTP_PORT, () => {
    pp(`Express Http Server is running at port ${HTTP_PORT}`);
  });

  socket_server.listen(SOCKET_PORT, () => {
    pp(`SocketIO Server is running at port ${SOCKET_PORT}`);
  });
}

// Disconnect from redis on exit
process.on('SIGINT', () => {
  pp('disconnecting redis');
  redisClient.disconnect().then(process.exit());
});

/**
 * This is the main entry point for the server
 */
if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
  console.log('Creating Redis client on localhost');
  redisClient = createClient();
  redisClient.connect().then(() => {
    pp('Redis Connected to localhost');
  });
  initRedisVariables(redisClient).then(({ loadedRooms, ccm, TESTGROUPID }) => {
    initExpressEndpoints(app, redisClient, ccm, TESTGROUPID);
    initSockets(io, loadedRooms);
    initAppListeners();
    mock(io);
  });
} else {
  console.log("Creating Redis client with socket: { host: 'redis', port: 6379 }");
  redisClient = createClient({
    socket: {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT)
    },
    legacyMode: true
  });
  console.log('Connecting to redis docker container');
  redisClient
    .connect()
    .then(() => {
      pp('Redis Connected to redis docker container');
    })
    .catch((err) => {
      pp('Redis Connection Error: ' + err, 'error');
    });
  console.log('Initializing Redis Variables');
  initRedisVariables(redisClient).then(({ loadedRooms, ccm, TESTGROUPID }) => {
    console.log('Initializing Express Endpoints');
    initExpressEndpoints(app, redisClient, ccm, TESTGROUPID);
    console.log('Initializing Sockets');
    initSockets(io, loadedRooms);
    console.log('Initializing App Listeners');
    initAppListeners();
  });
}

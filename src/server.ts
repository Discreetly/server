import express from 'express';
import { Server } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { serverConfig } from './config/serverConfig';
import { pp, shim } from './utils';
import mock from './data/mock';
import { websocketSetup as initWebsockets } from './websockets/index';
import { initEndpoints } from './endpoints/index';
import { createMessage } from './data/messages';

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

function initAppListeners() {
  const expressServerPort = serverConfig.serverInfoEndpoint.split(':')[1];
  const socketServerPort = serverConfig.messageHandlerSocket.split(':')[1];
  app.listen(expressServerPort, () => {
    pp(`Express Http Server is running at port ${expressServerPort}`);
  });

  socket_server.listen(socketServerPort, () => {
    pp(`SocketIO Server is running at port ${socketServerPort}`);
  });
}

/**
 * This is the main entry point for the server
 */
if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
  console.log('~~~~DEVELOPMENT MODE~~~~');
  initWebsockets(io);
  initEndpoints(app);
  initAppListeners();
  mock(io);
} else {
  initWebsockets(io);
  initEndpoints(app);
  initAppListeners();
}

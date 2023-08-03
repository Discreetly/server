import { Server } from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import basicAuth from 'express-basic-auth';
import { Server as SocketIOServer } from 'socket.io';

import { serverConfig } from './config/serverConfig';
import { pp, shim } from './utils';
import mock from './data/mock';
import { websocketSetup as initWebsockets } from './websockets/index';
import { initEndpoints } from './endpoints/index';
import { generateRandomClaimCode } from 'discreetly-claimcodes';
import { listEndpoints } from './endpoints/utils';

// TODO https://www.npmjs.com/package/winston

const app = express();
const socket_server = new Server(app);
shim();

app.use(express.json());
app.use(
  cors({
    origin: '*'
  })
);
app.use(helmet());
app.disable('x-powered-by');

const admin_password = process.env.PASSWORD
  ? process.env.PASSWORD
  : // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    (generateRandomClaimCode(4) as string);

const adminAuth = basicAuth({
  users: {
    admin: admin_password
  }
});

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
  return app;
}

/**
 * This is the main entry point for the server
 */
let _app
if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
  console.log('~~~~DEVELOPMENT MODE~~~~');
  initWebsockets(io);
  initEndpoints(app, adminAuth);
  listEndpoints(app);
  _app = initAppListeners();
  mock(io);
  // TODO! This is dangerous and only for development
  console.log('Admin password: ' + admin_password);
} else {
  initWebsockets(io);
  initEndpoints(app, adminAuth);
  _app = initAppListeners();
}


export default _app;

import express from 'express';
import http from 'http';
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

function initAppListeners(PORT) {
  const httpServer = http.createServer(app).listen(PORT, () => {
    pp(`Server is running at port ${PORT}`);
  });

  const io = new SocketIOServer(httpServer);
  return io;
}

/**
 * This is the main entry point for the server
 */
if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
  console.log('~~~~DEVELOPMENT MODE~~~~');
  console.log(serverConfig);
  const PORT = 3001;
  initEndpoints(app, adminAuth);
  const io = initAppListeners(PORT);
  initWebsockets(io);
  listEndpoints(app);
  mock(io);
  // TODO! This is dangerous and only for development
  console.log('Admin password: ' + admin_password);
} else {
  initEndpoints(app, adminAuth);
  const io = initAppListeners(process.env.PORT);
  initWebsockets(io);
}

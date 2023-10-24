import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import basicAuth from 'express-basic-auth';
import type { Server } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import type { Server as SocketIOServerT } from 'socket.io';
import { serverConfig } from './config/serverConfig';
import { pp, shim } from './utils';
import mock from './data/mock';
import { websocketSetup as initWebsockets } from './websockets/index';
import { initEndpoints } from './endpoints/index';
import { generateRandomClaimCode } from 'discreetly-claimcodes';
import { listEndpoints } from './endpoints/utils';
import { instrument } from '@socket.io/admin-ui';
import bcrypt from 'bcryptjs';

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

export const adminAuth = basicAuth({
  users: {
    admin: admin_password
  }
});

const intervalIds: NodeJS.Timer[] = [];

function initAppListeners(PORT) {
  const httpServer = http.createServer(app).listen(PORT, () => {
    pp(`Server is running at port ${PORT}`);
  });
  return httpServer;
}

/**
 * This is the main entry point for the server
 */
let _app: Server;
let io: SocketIOServerT;

interface ServerConfigStartupI {
  id?: string;
  name?: string;
  version?: string;
  port?: number | string;
  admin_password?: string;
}
const serverConfigStartup: ServerConfigStartupI = {
  ...(serverConfig as unknown as ServerConfigStartupI)
};
if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
  console.log('~~~~DEVELOPMENT MODE~~~~');
  const PORT = 3001;
  serverConfigStartup.port = PORT;
  serverConfigStartup.admin_password = admin_password;
  initEndpoints(app, adminAuth);
  _app = initAppListeners(PORT);
  listEndpoints(app);
  io = new SocketIOServer(_app, {
    cors: {
      origin: ['*', 'https://admin.socket.io'],
      credentials: true,
    }
  });
  intervalIds.push(initWebsockets(io));
  instrument(io, {
    auth: false,
    mode: 'development'
  });
  intervalIds.push(mock(io));
} else {
  const PORT = process.env.PORT;
  serverConfigStartup.port = PORT;
  initEndpoints(app, adminAuth);
  _app = initAppListeners(PORT);
  io = new SocketIOServer(_app, {
    cors: {
      origin: '*',
      credentials: true
    }
  });
  intervalIds.push(initWebsockets(io));
  instrument(io, {
    auth: {
      type: 'basic',
      username: 'admin',
      password: bcrypt.hashSync(process.env.PASSWORD ? process.env.PASSWORD : 'PASSWORD', 10)
    },
    mode: 'development'
  });
  io.emit('systemBroadcast', 'Server Up');
  process.on('beforeExit', () => {
    io.emit('systemBroadcast', 'System Going Down For Maintenance');
    process.exit(); // Manually exit the process after the async operation
  });
}

pp(serverConfigStartup, 'table');

export default _app;
export { io, intervalIds };

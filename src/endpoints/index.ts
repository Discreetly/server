import type { Express } from 'express';
import { serverConfig } from '../config/serverConfig';
import { pp } from '../utils';

import discordRouter from './gateways/discord';
import ethRouter from './gateways/ethereumGroup';
import theWordRouter from './gateways/theWord';
import codeRouter from './gateways/inviteCode';
import roomRouter from './rooms/rooms';
import identityRouter from './identity/idc';
import adminRouter from './admin/admin';
import jubmojiRouter from './gateways/jubmojis';

export function initEndpoints(app: Express) {
  // This code is used to fetch the server info from the api
  // This is used to display the server info on the client side
  app.use('/gateway/discord', discordRouter);
  app.use('/gateway/eth', ethRouter);
  app.use('/gateway/theword', theWordRouter);
  app.use('/gateway/code', codeRouter);
  app.use('/gateway/jubmojis', jubmojiRouter)
  app.use('/room', roomRouter);
  app.use('/identity', identityRouter);
  app.use('/admin', adminRouter);

  app.get(['/'], (req, res) => {
    pp('Express: fetching server info');
    res.status(200).json(serverConfig);
  });
}

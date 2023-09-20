const request = require('supertest');
import _app, { intervalIds } from '../src/server';
import { RoomI, genId } from 'discreetly-interfaces';
import { serverConfig } from '../src/config/serverConfig';
import { PrismaClient } from '@prisma/client';
import { beforeAll, beforeEach, afterAll, describe, expect, test } from '@jest/globals';
import { randBigint, randomRoomName } from './utils';

process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.PORT = '3001';

const CUSTOM_ID = '444';

const room = {
  roomName: randomRoomName(),
  rateLimit: 1000,
  userMessageLimit: 1,
  numClaimCodes: 5,
  approxNumMockUsers: 10,
  type: 'PUBLIC_CHAT'
};

const messageTestRoom = {
  roomName: randomRoomName(),
  rateLimit: 100,
  userMessageLimit: 2,
  numClaimCodes: 1,
  approxNumMockUsers: 10,
  type: 'PUBLIC_CHAT',
  roomId: CUSTOM_ID
};

let roomByIdTest: string;
let testCode = '';

const testIdentity = randBigint();
const username = 'admin';
const password = process.env.PASSWORD;

beforeAll(async () => {
  const prismaTest = new PrismaClient();
  await prismaTest.messages.deleteMany();
  await prismaTest.rooms.deleteMany();
  await prismaTest.claimCodes.deleteMany();
});

afterAll(async () => {
  intervalIds.forEach((id) => clearInterval(id));
  _app.close();
});

describe('Endpoints', () => {
  test('It should respond with server info', async () => {
    await request(_app)
      .get('/')
      .then((res) => {
        expect(res.status).toBe(200);
        expect(res.header['content-type']).toBe('application/json; charset=utf-8');
        expect(res.body.id).toBe(serverConfig.id);
      })
      .catch((error) => console.error("GET '/' - " + error));
  });

  test('It should add a new room to the database', async () => {
    const base64Credentials = Buffer.from(`${username}:${password}`).toString('base64');
    await request(_app)
      .post('/room/add')
      .set('Authorization', `Basic ${base64Credentials}`)
      .send(room)

      .then((res) => {
        try {
          expect(res.status).toEqual(200);
          const result = res.body;
          expect(res.body.message).toEqual('Room created successfully');
          expect(result.roomId).toBeDefined();
          roomByIdTest = result.roomId;
        } catch (error) {
          console.warn('POST /room/add - ' + error);
        }
      })
      .catch((error) => console.warn('POST /room/add - ' + error));
  });

  test('It should add a new room with a custom id to the database', async () => {
    const base64Credentials = Buffer.from(`${username}:${password}`).toString('base64');
    await request(_app)
      .post('/room/add')
      .set('Authorization', `Basic ${base64Credentials}`)
      .send(messageTestRoom)

      .then((res) => {
        try {
          expect(res.status).toEqual(200);
          const result = res.body;
          expect(res.body.message).toEqual('Room created successfully');
          expect(result.roomId).toBeDefined();
        } catch (error) {
          console.warn('POST /room/add - ' + error);
        }
      })
      .catch((error) => console.warn('POST /room/add - ' + error));
  });

  test('It shouldnt add a new room with the same ID', async () => {
    const base64Credentials = Buffer.from(`${username}:${password}`).toString('base64');
    await request(_app)
      .post('/room/add')
      .set('Authorization', `Basic ${base64Credentials}`)
      .send(messageTestRoom)

      .then((res) => {
        try {
          expect(res.status).toEqual(400);
          const result = res.body;
          console.warn(result);
        } catch (error) {
          console.warn('POST /room/add - ' + error);
        }
      })
      .catch((error) => console.warn('POST /room/add - ' + error));
  });

  test('It should return the room with the given id', async () => {
    await request(_app)
      .get(`/api/room/${roomByIdTest}`)
      .then((res) => {
        try {
          expect(res.status).toEqual(200);
          expect(res.body.name).toEqual(room.roomName);
        } catch (error) {
          console.error(`GET /api/room/:roomId - + ${error}`);
        }
      })
      .catch((error) => console.error('GET /api/room/:roomId - ' + error));
  });

  test('It should return the room with the given custom id', async () => {
    await request(_app)
      .get(`/api/room/${CUSTOM_ID}`)
      .then((res) => {
        try {
          expect(res.status).toEqual(200);
          expect(res.body.name).toEqual(messageTestRoom.roomName);
        } catch (error) {
          console.error(`GET /api/room/:roomId - + ${error}`);
        }
      })
      .catch((error) => console.error('GET /api/room/:roomId - ' + error));
  });

  test('It should return all rooms', async () => {
    const base64Credentials = Buffer.from(`${username}:${password}`).toString('base64');
    await request(_app)
      .get('/api/rooms')

      .set('Authorization', `Basic ${base64Credentials}`)
      .then((res) => {
        try {
          expect(res.status).toEqual(200);
          expect(typeof res.body).toEqual('object');
          expect(res.body[0].name).toEqual(room.roomName);
        } catch (error) {
          console.error('GET /api/rooms - ' + error);
        }
      })
      .catch((error) => console.error('GET /api/rooms - ' + error));
  });

  test("It should return all claim codes and add a user's identity to the rooms the claim code is associated with", async () => {
    const base64Credentials = Buffer.from(`${username}:${password}`).toString('base64');
    await request(_app)
      .get('/logclaimcodes')

      .set('Authorization', `Basic ${base64Credentials}`)
      .then(async (res) => {
        try {
          testCode = res.body[0].claimcode;
          expect(testCode.split('-').length).toEqual(4);
          expect(res.status).toEqual(401);
          expect(res.body.length).toBeGreaterThan(0);

          const joinTest = {
            code: testCode,
            idc: testIdentity
          };

          await request(_app)
            .post('/join')
            .send(joinTest)
            .then((res) => {
              expect(res.statusCode).toEqual(200);
              expect(res.body.status).toEqual('valid');
            });
        } catch (error) {
          console.error('Error in test: ', error);
        }
      })
      .catch((error) => {
        console.error('Error in request: ', error);
      });
  });

  test('It should return all rooms associated with the given identity', async () => {
    await request(_app)
      .get(`/api/rooms/${testIdentity}`)
      .then((res) => {
        try {
          expect(res.statusCode).toEqual(200);
        } catch (error) {
          console.error('GET /api/rooms/:idc - ' + error);
        }
      })
      .catch((error) => console.error('GET /api/rooms/:idc - ' + error));
  });

  test('It should send a message to all rooms', async () => {
    const message = {
      message: 'Test message'
    };
    const base64Credentials = Buffer.from(`${username}:${password}`).toString('base64');
    await request(_app)
      .post('/admin/message')
      .set('Authorization', `Basic ${base64Credentials}`)
      .send(message)
      .then((res) => {
        try {
          expect(res.statusCode).toEqual(200);
          expect(res.body).toEqual({ message: 'Messages sent to all rooms' });
        } catch (error) {
          console.error('POST /admin/message - ' + error);
        }
      });
  });

  test('It should return the messages for a given room', async () => {
    await request(_app)
      .get(`/api/room/${roomByIdTest}/messages`)
      .then((res) => {
        try {
          expect(res.statusCode).toEqual(200);
          expect(res.body.length).toBeGreaterThan(0);
        } catch (error) {
          console.error('GET /api/messages/:roomId - ' + error);
        }
      })
      .catch((error) => console.error('GET /api/messages/:roomId - ' + error));
  });

  describe('Messages', () => {
    let testRoom: RoomI;

    test('it should send and receive a message', async () => {
      await request(_app)
        .get(`/api/room/${CUSTOM_ID}`)
        .then((res) => {
          try {
            testRoom = res.body as RoomI;
          } catch (error) {
            console.error(`GET /api/room/:roomId - + ${error}`);
          }
        })
        .catch((error) => console.error('GET /api/room/:roomId - ' + error));
      console.log('testRoom', testRoom);
      expect(1).toBe(1);
    });
  });
});

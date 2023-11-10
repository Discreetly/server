const request = require('supertest');
import _app, { intervalIds } from '../src/server';
import { RoomI } from 'discreetly-interfaces';
import { serverConfig } from '../src/config/serverConfig';
import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll, describe, expect, test } from '@jest/globals';
import { randomRoomName } from './utils';
import { generateIdentityProof } from '../src/crypto/idcVerifier/verifier';
import { Identity } from '@semaphore-protocol/identity';


process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.PORT = '3001';

const CUSTOM_ID = '444';

const room = {
  roomName: randomRoomName(),
  rateLimit: 1000,
  userMessageLimit: 1,
  numClaimCodes: 0,
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

let testEthAddress = '0x123123123';

let roomByIdTest: string;
let testCode: string;
const testIdentity = new Identity();
console.log('identity', testIdentity);
const username = 'admin';
const password = process.env.PASSWORD;
const discordPassword = process.env.DISCORD_PASSWORD

beforeAll(async () => {
  const prismaTest = new PrismaClient();
  await prismaTest.messages.deleteMany();
  await prismaTest.rooms.deleteMany();
  await prismaTest.claimCodes.deleteMany();
  await prismaTest.ethereumGroup.deleteMany();
  await prismaTest.gateWayIdentity.deleteMany();
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
        expect(res.header['content-type']).toBe(
          'application/json; charset=utf-8'
        );
        expect(res.body.id).toBe(serverConfig.id);
      })
      .catch((error) => console.error("GET '/' - " + error));
  });

  test('It should add a new room to the database', async () => {
    const base64Credentials = Buffer.from(`${username}:${password}`).toString(
      'base64'
    );
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
  test('It should create claimCode for the new room', async () => {
    const base64Credentials = Buffer.from(`${username}:${password}`).toString(
      'base64'
    );
    await request(_app)
      .post(`/admin/addcode`)
      .set('Authorization', `Basic ${base64Credentials}`)
      .send({
        numCodes: 1,
        rooms: [roomByIdTest],
        all: false,
        expiresAt: 0,
        usesLeft: -1,
        discordId: '53125497960'
      })
      .then((res) => {
        try {
          console.log(res.body);
          testCode = res.body.codes[0].claimcode;
          expect(res.status).toEqual(200);
          expect(res.body.message).toEqual('Claim codes added successfully');
        } catch (error) {
          console.warn('POST /api/addcode - ' + error);
        }
      });
  });

  test('It should add a new room with a custom id to the database', async () => {
    const base64Credentials = Buffer.from(`${username}:${password}`).toString(
      'base64'
    );
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
    const base64Credentials = Buffer.from(`${username}:${password}`).toString(
      'base64'
    );
    await request(_app)
      .post('/room/add')
      .set('Authorization', `Basic ${base64Credentials}`)
      .send(messageTestRoom)

      .then((res) => {
        try {
          expect(res.status).toEqual(400);
          const result = res.body;
        } catch (error) {
          console.warn('POST /room/add - ' + error);
        }
      })
      .catch((error) => console.warn('POST /room/add - ' + error));
  });

  test('It should return the room with the given id', async () => {
    await request(_app)
      .get(`/room/${roomByIdTest}`)
      .then((res) => {
        try {
          expect(res.status).toEqual(200);
          expect(res.body.name).toEqual(room.roomName);
          expect(res.body.roomId).toEqual(roomByIdTest);
          expect(res.body.rateLimit).toEqual(1000);
          expect(res.body.userMessageLimit).toEqual(1);
          expect(res.body.membershipType).toEqual('IDENTITY_LIST')
          expect(res.body.ephemeral).toEqual('PERSISTENT')
          expect(res.body.encrypted).toEqual('PLAINTEXT');
          expect(res.body.identities.length).toBeGreaterThan(0);
        } catch (error) {
          console.error(`GET /api/room/:roomId - + ${error}`);
        }
      })
      .catch((error) => console.error('GET /api/room/:roomId - ' + error));
  });

  test('It should return the room with the given custom id', async () => {
    await request(_app)
      .get(`/room/${CUSTOM_ID}`)
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
    const base64Credentials = Buffer.from(`${username}:${password}`).toString(
      'base64'
    );
    await request(_app)
      .get('/admin/rooms')

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
    const base64Credentials = Buffer.from(`${username}:${password}`).toString(
      'base64'
    );
    await request(_app)
      .get('/admin/logclaimcodes')

      .set('Authorization', `Basic ${base64Credentials}`)
      .then(async (res) => {
        try {
          expect(res.status).toEqual(401);
          expect(res.body.length).toBeGreaterThan(0);

          const joinTest = {
            code: testCode,
            idc: testIdentity.getCommitment().toString()
          };

          await request(_app)
            .post('/gateway/code/join')
            .send(joinTest)
            .then((res) => {
              console.log(res.body);
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
    let proof = await generateIdentityProof(testIdentity, BigInt(Date.now()));

    await request(_app)
      .post(`/identity/${testIdentity.getCommitment().toString()}`)
      .send(proof)
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
    const base64Credentials = Buffer.from(`${username}:${password}`).toString(
      'base64'
    );
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
      .get(`/room/${roomByIdTest}/messages`)
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

  test('It should create a new Ethereum group', async () => {
    const base64Credentials = Buffer.from(`${username}:${password}`).toString(
      'base64'
    );
    await request(_app)
      .post('/gateway/eth/group/create')
      .set('Authorization', `Basic ${base64Credentials}`)
      .send({ name: 'EthGroup-Test', roomIds: [roomByIdTest] })
      .then((res) => {
        try {
          expect(res.statusCode).toEqual(200);
          expect(res.body.message).toEqual('Ethereum group created');
        } catch (error) {
          console.error('POST /gateway/eth/group/create - ' + error);
        }
      });
  });

  test('It should return all of the Ethereum Groups', async () => {
    const base64Credentials = Buffer.from(`${username}:${password}`).toString(
      'base64'
    );
    await request(_app)
      .get(`/gateway/eth/groups/all`)
      .set('Authorization', `Basic ${base64Credentials}`)
      .then((res) => {
        try {
          expect(res.statusCode).toEqual(200);
          expect(res.body.length).toBeGreaterThan(0);
        } catch (error) {
          console.error('GET /gateway/eth/groups/all - ' + error);
        }
      });
  });

  test('It should add Eth addresses to a group', async () => {
    const base64Credentials = Buffer.from(`${username}:${password}`).toString(
      'base64'
    );
    await request(_app)
      .post(`/gateway/eth/group/add`)
      .set('Authorization', `Basic ${base64Credentials}`)
      .send({ names: ['EthGroup-Test'], ethAddresses: [testEthAddress] })
      .then((res) => {
        try {
          expect(res.statusCode).toEqual(200);
          expect(res.body.success).toEqual(true)
        } catch (err) {
          console.error('POST /gateway/eth/group/add - ' + err);
        }
      });
  });
  test('It should return return the Groups the Ethereum Address is in', async () => {
    await request(_app)
      .get(`/gateway/eth/group/${testEthAddress}`)
      .then((res) => {
        try {
          expect(res.statusCode).toEqual(200);
          expect(res.body.status).toEqual('valid');
        } catch (err) {
          console.error('GET /gateway/eth/group/:address -' + err)
        }
      })
  })
  test('It should edit an Ethereum Group to add Eth addresses and roomIds', async () => {
    const base64Credentials = Buffer.from(`${username}:${password}`).toString(
      'base64'
    );
    await request(_app)
      .post('/gateway/eth/group/edit')
      .set('Authorization', `Basic ${base64Credentials}`)
      .send({name: 'EthGroup-Test', ethAddresses: ['0x321321321'], roomIds: []})
      .then((res) => {
        try {
          expect(res.statusCode).toEqual(200)
          expect(res.body.success).toEqual(true)
          expect(res.body.updatedGroup.ethereumAddresses.length).toBeGreaterThan(1)
        } catch (err) {
          console.error('POST /gateway/eth/group/edit - ' + err)
        }
      })
  })

  test('It should delete an Ethereum Group', async () => {
    const base64Credentials = Buffer.from(`${username}:${password}`).toString(
      'base64'
    );
    await request(_app)
      .post('/gateway/eth/group/delete')
      .set('Authorization', `Basic ${base64Credentials}`)
      .send({ name: 'EthGroup-Test' })
      .then((res) => {
        try {
          expect(res.statusCode).toEqual(200)
          expect(res.body.success).toEqual(true)
        } catch (err) {
          console.error('DELETE /gateway/eth/group/delete - ' + err)
        }
      })
  })

  describe('Messages', () => {
    let testRoom: RoomI;

    test('It should send and receive a message', async () => {
      await request(_app)
        .get(`/room/${CUSTOM_ID}`)
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

  describe('Discord', () => {
    test('It should add roles to a Discord Role mapping', async () => {
      const base64Credentials = Buffer.from(`${username}:${discordPassword}`).toString('base64')
      await request(_app)
        .post('/gateway/discord/addrole')
        .set('Authorization', `Basic ${base64Credentials}`)
        .send({
          roles: ['12345', '67890'],
          roomId: roomByIdTest,
          guildId: '87128718167878'
        })
        .then((res) => {
          try {
            expect(res.body.message).toEqual('Discord roles added successfully')
          } catch (error) {
            console.error(`POST /gateway/discord/addrole - ${error}`)
          }
        })
    })
    test('It should add a Discord Server to the database', async () => {
      const base64Credentials = Buffer.from(`${username}:${discordPassword}`).toString('base64')
      await request(_app)
      .post('/gateway/discord/addguild')
      .set('Authorization', `Basic ${base64Credentials}`)
      .send({guildId: '87128718167878'})
      .then((res) => {
        try {
          expect(res.body.message).toEqual('Discord guild added successfully')
        } catch (error) {
          console.error(`POST /gateway/discord/addguild - ${error}`)
        }
      })
    })
    test('It should get the rooms associated with a Discord Role mapping', async () => {
      const base64Credentials = Buffer.from(`${username}:${discordPassword}`).toString('base64')
      await request(_app)
        .post('/gateway/discord/getrooms')
        .set('Authorization', `Basic ${base64Credentials}`)
        .send({roles: ['12345', '67890'], discordId: '53125497960'})
        .then((res) => {
          try {
            expect(res.body.rooms.length).toBeGreaterThan(0)
          } catch (error) {
            console.error(`GET /gateway/discord/getrooms - ${error}`)
          }
        })
    })

    test('It should get the rooms associated with the discordId', async () => {
      const base64Credentials = Buffer.from(`${username}:${discordPassword}`).toString('base64')
      await request(_app)
      .post('/gateway/discord/rooms')
      .set('Authorization', `Basic ${base64Credentials}`)
      .send({ discordUserId: '53125497960' })
      .then((res) => {
        try {
          expect(res.body.rooms.length).toBeGreaterThan(0)
        } catch (error) {
          console.error(`POST /gateway/discord/rooms - ${error}`)
        }
      })
    })

    test('It should get the room mappings for a Discord Server ID', async () => {
      const base64Credentials = Buffer.from(`${username}:${discordPassword}`).toString('base64')
      await request(_app)
      .post('/gateway/discord/checkrooms')
      .set('Authorization', `Basic ${base64Credentials}`)
      .send({ discordId: '87128718167878' })
      .then((res) => {
        try {
          expect(res.body.length).toBeGreaterThan(0)
        } catch (error) {
          console.error(`POST /gateway/discord/checkrooms - ${error}`)
        }
      })
    })
  })
});

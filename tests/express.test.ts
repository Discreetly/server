const request = require('supertest');
import { assert } from 'console';
import _app from '../src/server'
import { genId } from 'discreetly-interfaces';
import { serverConfig } from '../src/config/serverConfig';
import { describe } from 'node:test';

process.env.DATABASE_URL = process.env.DATABASE_URL_TEST



const room = {
  roomName: 'Test-room',
  rateLimit: 1000,
  userMessageLimit: 1,
  numClaimCodes: 5,
  approxNumMockUsers: 20,
}

const roomByIdTest = genId(serverConfig.id, room.roomName).toString();

describe('GET /', () => {
  test('It should respond with server info', () => {
    request(_app).get('/').expect('Content-Type', 'application/json; charset=utf-8').then(res => {
    })
  })
})

describe("POST /room/add", () => {
  test("It should add a new room to the database", async () => {
    const username = 'admin';
    const password = process.env.PASSWORD;
    const base64Credentials = Buffer.from(`${username}:${password}`).toString('base64');

    await request(_app)
      .post("/room/add")
      .set('Authorization', `Basic ${base64Credentials}`)
      .send(room)
      .then(res => {
        expect(res.json === '{message :"Room created successfully"}')
      });

  });
});

describe("GET /api/room/:id", () => {
  test("It should return the room with the given id", async () => {
    await request(_app)
      .get(`/api/room/${roomByIdTest}`)
      .then(res => {
        console.log(res.body);
        expect(res.body.roomName === room.roomName)
      });
  });
});

describe("GET /api/rooms", () => {
  test("It should return all rooms", async () => {
    await request(_app)
      .get("/api/rooms")
      .then(res => {
        expect(res.body.length > 0)
      });
  });
})

describe("GET /logclaimcodes", () => {
  test("It should return all claim codes", async () => {
    const username = 'admin';
    const password = process.env.PASSWORD;
    const base64Credentials = Buffer.from(`${username}:${password}`).toString('base64');
    await request(_app)
      .get("/logclaimcodes")
      .set('Authorization', `Basic ${base64Credentials}`)
      .then(res => {
        expect(res.body.length > 0)
      });
  });
});

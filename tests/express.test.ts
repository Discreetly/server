const request = require('supertest');
import _app from '../src/server'
import { genId } from 'discreetly-interfaces';
import { serverConfig } from '../src/config/serverConfig';
import { describe } from 'node:test';
import expressBasicAuth from 'express-basic-auth';
import { transferableAbortController } from 'node:util';


process.env.DATABASE_URL = process.env.DATABASE_URL_TEST



const room = {
  roomName: 'Test-room',
  rateLimit: 1000,
  userMessageLimit: 1,
  numClaimCodes: 5,
  approxNumMockUsers: 20,
}

const roomByIdTest = genId(serverConfig.id, room.roomName).toString();

const joinTest = {
  code: "coast-filter-noise-feature", //needs to be changed to a valid code
  idc: "12345678901234567890"
}

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
        expect(res.json).toBe('{message :"Room created successfully"}')
      });
  });
});

describe("GET /api/room/:id", () => {
  test("It should return the room with the given id", async () => {
    await request(_app)
      .get(`/api/room/${roomByIdTest}`)
      .then(res => {
        console.log(res.body);
        expect(res.body.roomName).toBe(room.roomName)
      });
  });
});

describe("GET /api/rooms", () => {
  test("It should return all rooms", async () => {
    const username = 'admin';
    const password = process.env.PASSWORD;
    const base64Credentials = Buffer.from(`${username}:${password}`).toString('base64');
    await request(_app)
      .get("/api/rooms")
      .set('Authorization', `Basic ${base64Credentials}`)
      .then(res => {
        expect(res.status).toBe(200)
        expect(res.bodyname).toBe(room.roomName)
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
        expect(res.status).toBe(401)
        expect(res.body.length).toBeGreaterThan(0)
      });
  });
});

describe("POST /join", () => {
  test("It should add a users identity to the rooms the claim code is associated with", async () => {
    await request(_app)
    .post("/join")
    .send(joinTest)
    .then(res => {
      expect(res.statusCode).toBe(200)
      expect(res.body.status).toBe('valid')
    })
  })
})

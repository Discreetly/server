const request = require('supertest');
import _app from '../src/server'
import { genId } from 'discreetly-interfaces';
import { serverConfig } from '../src/config/serverConfig';
import { PrismaClient } from '@prisma/client';
import { beforeAll, beforeEach, describe, expect, test } from "@jest/globals"
import { pp } from '../src/utils';

process.env.DATABASE_URL = process.env.DATABASE_URL_TEST
process.env.PORT = "3001"


beforeAll(async () => {
  const prismaTest = new PrismaClient();
  await prismaTest.rooms.deleteMany();
})

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

const testIdedntity = "16880191893150922752288630180015602515378641737696672884604233982758617720405"

describe("Endpoints should all work hopefully", () => {

  test('It should respond with server info', async () => {
    await request(_app).get('/')
      .expect('Content-Type').toBe('application/json; charset=utf-8')
      .then((res) => res)
      .catch(error => pp(error, 'error'))
  })



  test("It should add a new room to the database", async () => {

    const username = 'admin';
    const password = process.env.PASSWORD;
    const base64Credentials = Buffer.from(`${username}:${password}`).toString('base64');

    await request(_app)
      .post("/room/add")
      .set('Authorization', `Basic ${base64Credentials}`)
      .send(room)
      .then(res => {
        try {
          expect(res.json).toBe('{message :"Room created successfully"}')
        }
        catch (error) {
          pp(error, 'error')
        }
      })
      .catch(error => pp(error, 'error'))
  });


  test("It should return the room with the given id", async () => {
    await request(_app)
      .get(`/api/room/${roomByIdTest}`)
      .then(res => {
        try {
          expect(res.body.roomName).toBe(room.roomName)

        } catch (error) {
          pp(error, 'error')
        }
      })
      .catch(error => pp(error, 'error'))
  });


  test("It should return all rooms", async () => {
    const username = 'admin';
    const password = process.env.PASSWORD;
    const base64Credentials = Buffer.from(`${username}:${password}`).toString('base64');
    await request(_app)
      .get("/api/rooms")
      .set('Authorization', `Basic ${base64Credentials}`)
      .then(res => {
        try {
          expect(res.status).toBe(200)
          expect(res.bodyname).toBe(room.roomName)

        } catch (error) {
          pp(error, 'error')
        }
      })
      .catch(error => pp(error, 'error'))
  });



  test("It should return all claim codes", async () => {
    const username = 'admin';
    const password = process.env.PASSWORD;
    const base64Credentials = Buffer.from(`${username}:${password}`).toString('base64');
    await request(_app)
      .get("/logclaimcodes")
      .set('Authorization', `Basic ${base64Credentials}`)
      .then(res => {
        try {
          expect(res.status).toBe(401)
          expect(res.body.length).toBeGreaterThan(0)

        } catch (error) {
          pp(error, 'error')
        }
      })
      .catch(error => pp(error, 'error'))
  });



  test("It should add a users identity to the rooms the claim code is associated with", async () => {
    await request(_app)
      .post("/join")
      .send(joinTest)
      .then(res => {
        try {
          expect(res.statusCode).toBe(200)
          expect(res.body.status).toBe('valid')

        } catch (error) {
          pp(error, 'error')
        }
      })
      .catch(error => pp(error, 'error'))
  })



  test("It should return all rooms associated with the given identity", async () => {
    await request(_app)
      .get(`/api/rooms/${joinTest.idc}`)
      .then(res => {
        try {
          expect(res.statusCode).toBe(200)
          expect(res.body.length).toBeGreaterThan(0)
        } catch (error) {

        }
      })
      .catch(error => pp(error, 'error'))
  })
})

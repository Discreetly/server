const request = require("supertest");
import _app from "../src/server";
import { genId } from "discreetly-interfaces";
import { serverConfig } from "../src/config/serverConfig";
import { PrismaClient } from "@prisma/client";
import { beforeAll, beforeEach, describe, expect, test } from "@jest/globals";
import { pp } from "../src/utils";
import { randBigint, randomRoomName } from "./utils";
console.log(process.env.DATABASE_URL.slice(0, 10))
console.log(process.env.DATABASE_URL_TEST.slice(0, 10))
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.PORT = "3001";


beforeAll(async () => {
  const prismaTest = new PrismaClient();
  await prismaTest.messages.deleteMany();
  await prismaTest.rooms.deleteMany();
  await prismaTest.claimCodes.deleteMany();
});

const room = {
  roomName: randomRoomName(),
  rateLimit: 1000,
  userMessageLimit: 1,
  numClaimCodes: 5,
  approxNumMockUsers: 10,
  type: "PUBLIC"
};

const roomByIdTest = genId(serverConfig.id, room.roomName).toString();
let testCode = "";
const testIdentity = randBigint();
const username = "admin";
const password = process.env.PASSWORD;


describe("Endpoints should all work hopefully", () => {
  test("It should respond with server info", async () => {
    await request(_app)
      .get("/")
      .then((res) => {
        expect(res.status).toBe(200);
        expect(res.header["content-type"]).toBe(
          "application/json; charset=utf-8"
        );
        expect(res.body.id).toBe(serverConfig.id);
      })
      .catch((error) => pp("GET '/' - " + error, "error"));
  });

  test("It should add a new room to the database", async () => {
    const username = "admin";
    const password = process.env.PASSWORD;
    const base64Credentials = Buffer.from(`${username}:${password}`).toString(
      "base64"
    );
    await request(_app)
      .post("/room/add")
      .set("Authorization", `Basic ${base64Credentials}`)
      .send(room)

      .then((res) => {
        try {
          expect(res.body).toEqual({ message: "Room created successfully" });
        } catch (error) {
          console.warn("POST /room/add - " + error);
        }
      })
      .catch((error) => console.warn("POST /room/add - " + error));
  });

  test("It should return the room with the given id", async () => {
    await request(_app)
      .get(`/api/room/${roomByIdTest}`)
      .then((res) => {
        try {
          expect(res.status).toEqual(200);
          expect(res.body.name).toEqual(room.roomName);
        } catch (error) {
          pp("GET /api/room/:roomId - " + error, "error");
        }
      })
      .catch((error) => pp("GET /api/room/:roomId - " + error, "error"));
  });

  test("It should return all rooms", async () => {
    const username = "admin";
    const password = process.env.PASSWORD;
    const base64Credentials = Buffer.from(`${username}:${password}`).toString(
      "base64"
    );
    await request(_app)
      .get("/api/rooms")

      .set("Authorization", `Basic ${base64Credentials}`)
      .then((res) => {
        try {
          expect(res.status).toEqual(200);
          expect(typeof res.body).toEqual("object");
          expect(res.body[0].name).toEqual(room.roomName);
        } catch (error) {
          pp("GET /api/rooms - " + error, "error");
        }
      })
      .catch((error) => pp("GET /api/rooms - " + error, "error"));
  });


  test("It should return all claim codes and add a user's identity to the rooms the claim code is associated with", async () => {
    const username = "admin";
    const password = process.env.PASSWORD;
    const base64Credentials = Buffer.from(`${username}:${password}`).toString("base64");
    await request(_app)
      .get("/logclaimcodes")

      .set("Authorization", `Basic ${base64Credentials}`)
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
            .post("/join")
            .send(joinTest)
            .then((res) => {
              expect(res.statusCode).toEqual(200);
              expect(res.body.status).toEqual("valid");
            });
        } catch (error) {
          console.error('Error in test: ', error);
        }
      })
      .catch((error) => {
        console.error('Error in request: ', error);
      });
  });
  console.log(testIdentity);

  test("It should return all rooms associated with the given identity", async () => {
    await request(_app)
    .get(`/api/rooms/${testIdentity}`)
    .then((res) => {
        try {
          console.log(res.body);
          expect(res.statusCode).toEqual(200);
        } catch (error) {
          pp("GET /api/rooms/:idc - " + error, "error");
        }
      })
      .catch((error) => pp("GET /api/rooms/:idc - " + error, "error"));
  });

  test("It should send a message to all rooms", async () => {
    const message = {
      message: "Test message",
    };
    const base64Credentials = Buffer.from(`${username}:${password}`).toString(
      "base64"
    );
    await request(_app)
      .post("/admin/message")
      .set("Authorization", `Basic ${base64Credentials}`)
      .send(message)
      .then((res) => {
        try {
          expect(res.statusCode).toEqual(200);
          expect(res.body).toEqual({ message: "Messages sent to all rooms" });
        } catch (error) {
          pp("POST /admin/message - " + error, "error");
        }
      });
  });

  test("It should return the messages for a given room", async () => {
    await request(_app)
      .get(`/api/room/${roomByIdTest}/messages`)
      .then((res) => {
        try {
          expect(res.statusCode).toEqual(200);
          expect(res.body.length).toBeGreaterThan(0);
        } catch (error) {
          pp("GET /api/messages/:roomId - " + error, "error");
        }
      })
      .catch((error) => pp("GET /api/messages/:roomId - " + error, "error"));
  });
});

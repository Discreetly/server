import { PrismaClient } from '@prisma/client'
import { genId } from 'discreetly-interfaces';


const prisma = new PrismaClient();




const idc = genId(0n, "First User").toString();
const idc2 = genId(0n, "Second User").toString();

async function main() {
  const groupOne = await prisma.rooms.upsert({
    where: {
      roomId: genId(0n, "First Room").toString()
    },
    update: {},
    create: {
      roomId: genId(0n, "First Room").toString(),
      name: "First Room",
      identities: [idc, idc2]
    }
  })
  const groupTwo = await prisma.rooms.upsert({
    where: {
      roomId: genId(0n, "Room Two").toString()
    },
    update: {},
    create: {
      roomId: genId(0n, "Room Two").toString(),
      name: "Room Two",
      identities: [idc]
    }
  })
}
main();

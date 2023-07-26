import { PrismaClient } from '@prisma/client'
import { genId } from 'discreetly-interfaces';

const prisma = new PrismaClient();
const idc = genId(0n, "First User").toString();
const idc2 = genId(0n, "Second User").toString();

async function main() {
  const groupOne = await prisma.groups.upsert({
    where: { groupId: genId(0n, "Discreetly Test").toString() },
    update: {},
    create: {
      groupId: genId(0n, "Discreetly Test").toString(),
      name: "Discreetly Test",
      rooms: {
        create: {
          roomId: genId(0n, "First Room").toString(),
          name: "First Room",
          identities: [idc]
        }
      }
    }
  })
  const groupTwo = await prisma.groups.upsert({
    where: { groupId: genId(0n, "Server Test").toString() },
    update: {},
    create: {
      groupId: genId(0n, "Server Test").toString(),
      name: "Server Test",
      rooms: {
        create: {
          roomId: genId(0n, "Test").toString(),
          name: "Test",
          identities: [idc, idc2]
        }
      }
    }
  })
}
main();

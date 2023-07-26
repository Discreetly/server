import { PrismaClient } from '@prisma/client'
import { genId } from 'discreetly-interfaces';

const prisma = new PrismaClient();
const idc = genId(0n, "First User").toString();

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
}
main();

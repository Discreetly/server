import { PrismaClient } from '@prisma/client'
import { genId } from 'discreetly-interfaces';
import { generateClaimCodes } from 'discreetly-claimcodes';

const prisma = new PrismaClient();




const idc = genId(0n, "First User").toString();
const idc2 = genId(0n, "Second User").toString();
const claimCodes = generateClaimCodes(10);
// console.log(claimCodes);
let codeArr: any[] = [];
claimCodes.forEach(code => {
  codeArr.push({ claimcode: code.code })
})

const seedData = {
  where: {
    roomId: genId(0n, "First Room").toString()
  },
  update: {},
  create: {
    roomId: genId(0n, "First Room").toString(),
    name: "First Room",
    identities: [idc, idc2],
    claimCodes: {
      create: codeArr

    }
  }
}
async function main() {

  await prisma.rooms.upsert(seedData)
  await prisma.rooms.upsert({
    where: {
      roomId: genId(0n, "Room Two").toString()
    },
    update: {},
    create: {
      roomId: genId(0n, "Room Two").toString(),
      name: "Room Two",
      identities: [idc],
      claimCodes: {
        create: codeArr
      }
    }
  })
  console.log(seedData);
}
main();

import { createRoom } from '../src/data/db';
import { createEthGroup } from '../src/data/db';
import addresses from './addresses';
async function main() {
  //   @param name — The name of the room.
  // @param rateLimit — The length of an epoch in milliseconds
  // @param userMessageLimit — The message limit per user per epoch
  // @param numClaimCodes — The number of claim codes to generate for the room.
  // @param approxNumMockUsers — The approximate number of mock users to generate for the room.
  await createRoom('2 Second Room', 2000, 1, 0, 20, 'PUBLIC');
  await createRoom('10 Second Room', 10000, 3, 0, 20, 'PUBLIC');
  await createRoom('100 Second Room', 100000, 12, 0, 20, 'PUBLIC');
  await createRoom('Alpha Testers', 100000, 12, 30, 20, 'PUBLIC');
  await createRoom('PSE', 100000, 12, 80, 20, 'PUBLIC');
  await createRoom('SBC Experiments', 100000, 12, 20, 20, 'PUBLIC');
  await createRoom('Ban Appeals', 10000, 1, 0, 5, 'PUBLIC', [], '666');
  await createRoom('The Word', 10000, 12, 0, 0, 'PUBLIC', [], '007001');
  const bcgd = await createRoom('Beacon Chain Genesis Depositors', 10000, 12, 0 ,20, 'PUBLIC');
  const sgf = await createRoom('Stateful Genesis Funders', 10000, 12, 0, 20, 'PUBLIC');
  await createEthGroup('Beacon Chain Genesis Depositors', bcgd!.roomId, addresses.bcgd);
  await createEthGroup('Stateful Genesis Funders', sgf!.roomId, addresses.sgf);
}

await main();

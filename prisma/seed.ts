import { createRoom } from '../src/data/db';
import { createEthGroup } from '../src/data/db';
import addresses from './addresses';
async function main() {
  /**
  *   @param name — The name of the room.
  * @param rateLimit — The length of an epoch in milliseconds
  * @param userMessageLimit — The message limit per user per epoch
  * @param numClaimCodes — The number of claim codes to generate for the room.
  * @param approxNumMockUsers — The approximate number of mock users to generate for the room.
  * @param type - The type of room. PUBLIC or PRIVATE
  * @param adminIdentities - The identities of the admins of the room.
  * @param roomId - The roomId of the room to be created.
  */
  await createRoom('2 Second Room', 2000, 1, 0, 20, 'PUBLIC', [], '20155607622739913528708582707389798203895994292773716935431197669304746014398');
  await createRoom('10 Second Room', 10000, 3, 0, 20, 'PUBLIC', [], '15365950124115259122299397335353503712492707509718474633204755132763780105662');
  await createRoom('100 Second Room', 100000, 12, 0, 20, 'PUBLIC', [], '9140365210618339744130775644008692650778595188985750546820671632708469016277');
  await createRoom('Alpha Testers', 100000, 12, 30, 20, 'PUBLIC', [], '1406889119610943773982914340053908893373464304417165775622512450080102390258');
  await createRoom('PSE', 100000, 12, 80, 20, 'PUBLIC', [], '16126092212458677464797669730808312928970541841197462821829418244240512408136');
  await createRoom('SBC Experiments', 100000, 12, 20, 20, 'PUBLIC', [], '3281998205073811527542807269171744412206947067371650747172791930961322423724');
  await createRoom('Ban Appeals', 10000, 1, 0, 5, 'PUBLIC', [], '666');
  await createRoom('The Word', 10000, 12, 0, 0, 'PUBLIC', [], '007001');
  const bcgd = await createRoom('Beacon Chain Genesis Depositors', 10000, 12, 0 ,20, 'PUBLIC');
  const sgf = await createRoom('Stateful Genesis Funders', 10000, 12, 0, 20, 'PUBLIC');
  await createEthGroup('Beacon Chain Genesis Depositors', bcgd!.roomId, addresses.bcgd);
  await createEthGroup('Stateful Genesis Funders', sgf!.roomId, addresses.sgf);
}

await main();

import { createRoom } from '../src/data/db';

async function main(){
  await createRoom('1 Second Room', 1000, 1, 10, 20, 'PUBLIC');
  await createRoom('10 Second Room', 10000, 2, 10, 20, 'PUBLIC');
  await createRoom('100 Second Room', 100000, 10, 10, 20, 'PUBLIC');
}

await main();

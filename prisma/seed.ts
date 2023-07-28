import { createRoom } from '../src/data/db';

function main() {
  createRoom('1 Second Room', 1000, 1, 10);
  createRoom('10 Second Room', 10000, 2, 10);
  createRoom('100 Second Room', 100000, 10, 10);
}

main();

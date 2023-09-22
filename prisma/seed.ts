import { createRoom } from '../src/data/db';

async function main() {
  //   @param name — The name of the room.
  // @param rateLimit — The length of an epoch in milliseconds
  // @param userMessageLimit — The message limit per user per epoch
  // @param numClaimCodes — The number of claim codes to generate for the room.
  // @param approxNumMockUsers — The approximate number of mock users to generate for the room.
  await createRoom('2 Second Room', 2000, 1, 0, 20, 'PUBLIC_CHAT');
  await createRoom('10 Second Room', 10000, 3, 0, 20, 'PUBLIC_CHAT');
  await createRoom('100 Second Room', 100000, 12, 0, 20, 'PUBLIC_CHAT');
  await createRoom('Alpha Testers', 100000, 12, 30, 20, 'PUBLIC_CHAT');
  await createRoom('PSE', 100000, 12, 80, 20, 'PUBLIC_CHAT');
  await createRoom('SBC Experiments', 100000, 12, 20, 20, 'PUBLIC_CHAT');
  await createRoom('Ban Appeals', 10000, 1, 0, 5, 'PUBLIC_CHAT', '666');
}

await main();

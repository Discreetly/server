import { faker } from '@faker-js/faker';

export function randBigint(): bigint {
  return faker.number.bigInt();
}

<<<<<<< HEAD
export function randomRoomName(min = 5, max = 20): string {
=======
export function randomRoomName(min = 5, max = 20) {
>>>>>>> system-messages
  return faker.string.alphanumeric({ length: { min: min, max: max } });
}

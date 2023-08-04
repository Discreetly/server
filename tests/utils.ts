import { faker } from '@faker-js/faker';

export function randBigint() {
  return faker.number.bigInt();
}

export function randomRoomName(min = 5, max = 20) {
  faker.string.alphanumeric({ length: { min: min, max: max } });
}

import { faker } from '@faker-js/faker';

export function randBigint(): bigint {
  return faker.number.bigInt();
}

export function randomRoomName(min = 5, max = 20): string {
  return faker.string.alphanumeric({ length: { min: min, max: max } });
}

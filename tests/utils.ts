import { faker } from '@faker-js/faker';

export function randBigint(): bigint {
  const min = 1000000000000000000000000000000000000000000000000000000000000000000000000000n;
  const max = 9999999999999999999999999999999999999999999999999999999999999999999999999999n;
  return faker.number.bigInt({ min: min, max: max });

export function randomRoomName(min = 5, max = 20): string {
  return faker.string.alphanumeric({ length: { min: min, max: max } });
}

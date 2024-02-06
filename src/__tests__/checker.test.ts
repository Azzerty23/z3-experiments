import { checker } from '../checker';

describe('permissions checker', () => {
  // @@allow('read', ( inStock || status == "restocking" ) && ( (auth().age > 16 && alcoholLevel < 5) || auth().age > 18) )
  it('Without args', async () => {
    const { result, solution } = await checker({});
    console.log(solution);
    expect(result).toEqual(true);
  });

  it('One arg', async () => {
    const { result } = await checker({ alcoholLevel: 1 });
    expect(result).toEqual(true);
  });

  it('With simple args', async () => {
    const { result } = await checker({ alcoholLevel: { ge: 10, lt: 9 } });
    expect(result).toEqual(false);
  });

  it('With args and user', async () => {
    const { result } = await checker(
      { alcoholLevel: { ge: 3, lt: 10 } },
      { age: { lt: 15 } },
    );
    expect(result).toEqual(false);
  });

  it('with invalid args -> filtered', async () => {
    const { result } = await checker(
      { alcoholLevel: { ge: 3, lt: 10 }, unknownArg: 0 },
      { age: 16 },
    );
    expect(result).toEqual(true);
  });

  it('with OR filter', async () => {
    const { result } = await checker(
      {
        OR: [{ alcoholLevel: { ge: 1, le: 5 } }, { alcoholLevel: { lt: 20 } }],
        alcoholLevel: { ge: 2, lt: 10 },
      },
      { age: 17 },
    );
    expect(result).toEqual(true);
  });

  it('with OR condition', async () => {
    const { result } = await checker(
      {
        alcoholLevel: {
          OR: [
            { ge: 20, lt: 10 },
            { ge: 1, lt: 2 },
          ],
        },
      },
      { age: 16 },
    );
    expect(result).toEqual(true);
  });

  it('with boolean conditions', async () => {
    const { result } = await checker(
      {
        alcoholLevel: 0,
        inStock: false,
      },
      { age: 30 },
    );
    expect(result).toEqual(true);
  });

  it('with boolean conditions and OR', async () => {
    const { result } = await checker(
      {
        OR: [
          { alcoholLevel: 0, inStock: false },
          { alcoholLevel: 100, inStock: true },
        ],
      },
      { age: 16 },
    );
    expect(result).toEqual(true);
  });

  it('with partial condition on user', async () => {
    const { result } = await checker(
      {
        OR: [
          { alcoholLevel: 0, inStock: false },
          { inStock: true, 'user.age': { lt: 18 } }, // override user age condition
        ],
      },
      { age: 20 },
    );
    expect(result).toEqual(true);
  });

  it('with string literal condition', async () => {
    const { result } = await checker({ status: 'restocking' }); // status turned to boolean
    expect(result).toEqual(true);
  });

  it('with string literal condition (2)', async () => {
    const { result } = await checker({ status: 'unknown' }, { age: 20 });
    expect(result).toEqual(true);
  });

  it('with boolean only', async () => {
    const { result } = await checker({}, { age: 20 });
    expect(result).toEqual(true);
  });

  it('TODO: with relations', async () => {
    // handle relations in nested conditions (e.g. user.age > 18 -> { user: { age: { gt: 18 } } })
    const { result } = await checker(
      {
        OR: [
          { alcoholLevel: 0, inStock: false },
          { inStock: true, 'user.age': { lt: 18 } }, // override user age condition,
          { 'manufacturer.id': 1234 }, // turn manufacturer.id to boolean
        ],
      },
      { age: 20 },
    );
    expect(result).toEqual(true);
  });
});

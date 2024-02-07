import { checker } from '../checker';

describe('permissions checker', () => {
  // @@allow('read', ( manufacturer == auth() || auth().profile.mantra == "zen" ) && ( inStock || status == "restocking" ) && ( (auth().age >= 16 && alcoholLevel < 5) || auth().age >= 18) )
  it('Without args should still be true', async () => {
    const { result, assertions } = await checker({});
    // {
    //   inStock: 'true',
    //   alcoholLevel: '4',
    //   'user.age': '16',
    //   status: 'false',
    //   'user.profile.mantra': 'true',
    //   _withAuth: 'false'
    // }
    expect(assertions?.length).toEqual(1); // _withAuth assertion still present (automatically added to args)
    expect(result).toEqual(true);
  });

  it('One arg', async () => {
    const { result, assertions } = await checker({
      alcoholLevel: 20,
    });
    expect(assertions?.length).toEqual(1);
    expect(result).toEqual(true);
  });

  it('With contradictory range conditions', async () => {
    const { result } = await checker({ alcoholLevel: { ge: 10, lt: 9 } });
    expect(result).toEqual(false);
  });

  it('With args and user', async () => {
    const { result } = await checker(
      {
        alcoholLevel: { ge: 3, lt: 10 },
      },
      { age: { lt: 15 } },
    );
    expect(result).toEqual(false);
  });

  it('with invalid args -> filtered', async () => {
    const { result } = await checker(
      { alcoholLevel: { ge: 3, lt: 10 }, invalidArg: 0 },
      { age: 16 },
    );
    expect(result).toEqual(true);
  });

  it('with OR filter', async () => {
    const { result } = await checker(
      {
        OR: [{ alcoholLevel: { lt: 5 } }, { alcoholLevel: { gt: 20 } }], // OR [true, false]
        // AND:
        alcoholLevel: { ge: 2, lt: 10 }, // true
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
            { ge: 20, lt: 10 }, // false
            { ge: 1, lt: 2 }, // true
          ],
        },
      },
      { age: 16 },
    );
    expect(result).toEqual(true);
  });

  it('with boolean conditions', async () => {
    const { result } = await checker({
      inStock: false,
      status: 'nope',
    });
    expect(result).toEqual(false);
  });

  it('with numeric conditions and OR', async () => {
    const { result } = await checker(
      {
        OR: [
          { alcoholLevel: 0 }, // true
          { alcoholLevel: 100 }, // false
        ],
      },
      { age: 16 },
    );
    expect(result).toEqual(true);
  });

  it('with partial condition on user', async () => {
    const { result } = await checker(
      {
        'user.age': { lt: 10 }, // add user age constraint
      },
      { age: 20 },
    );
    expect(result).toEqual(false);
  });

  it('with string literal condition', async () => {
    const validStatus = 'restocking';
    const { result } = await checker({
      inStock: false,
      status: { OR: [validStatus, 'invalid'] }, // statuses turned to assertions
    });
    expect(result).toEqual(true);
  });

  it('with relations', async () => {
    // handle relations in nested conditions (e.g. user.age > 18 -> { user: { age: { gt: 18 } } })
    const { result } = await checker(
      { manufacturerId: 1234, 'user.profile.mantra': 'invalid' }, // turn manufacturer.id to boolean
      { id: 12345 },
    );
    expect(result).toEqual(false);
  });

  it('comparison with unauthenticated user should be unsatisfied assertion', async () => {
    const { result, assertions, solution } = await checker(
      { manufacturerId: 1234, 'user.profile.mantra': 'invalid' }, // turn manufacturer.id to boolean
      { id: undefined },
    );
    expect(result).toEqual(false);
  });
});

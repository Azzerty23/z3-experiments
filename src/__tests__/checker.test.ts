import { checker } from '../checker';

// NOTE: Some tests are cheating by defining user context w/o id (not real life scenario)

// @@allow('read', ( manufacturer == auth() || auth().profile.mantra == "zen" ) && ( inStock || startsWith(status, "stock") ) && ( (auth().age >= 16 && alcoholLevel < 5) || auth().age >= 18) )
// @@allow('read', space.members?[user == auth()]

describe('permissions checker', () => {
  it('without args or involvement of user should still be true', async () => {
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

  it('one arg', async () => {
    const { result, assertions } = await checker({
      alcoholLevel: 20,
    });
    expect(assertions?.length).toEqual(1);
    expect(result).toEqual(true);
  });

  it('with contradictory range conditions', async () => {
    const { result } = await checker(
      { alcoholLevel: { ge: 10, lt: 9 } },
      { age: 20 },
    );
    expect(result).toEqual(false);
  });

  it('with args and user', async () => {
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

  it('with falsy boolean conditions', async () => {
    const { result } = await checker({
      inStock: false,
      status: 'nope',
    });
    expect(result).toEqual(false);
  });

  it('with truthy boolean conditions', async () => {
    const { result } = await checker({
      inStock: false,
      status: 'stock',
    });
    expect(result).toEqual(true);
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

  it('with truthy string literal condition', async () => {
    const validStatus = 'stock';
    const { result } = await checker({
      inStock: false,
      status: { in: [validStatus, 'invalid'] }, // statuses turned to assertions
    });
    expect(result).toEqual(true);
  });

  it('with falsy string literal condition', async () => {
    const { result } = await checker({
      inStock: false,
      status: { in: ['nope', 'invalid'] }, // statuses turned to assertions
    });
    expect(result).toEqual(false);
  });

  it('with falsy simple relations', async () => {
    const { result } = await checker(
      {
        spaceId: 'nope',
        manufacturerId: 'not-1234',
        'user.profile.mantra': 'invalid',
      },
      { id: '1234', spaceId: 'space-123' },
    );
    expect(result).toEqual(false);
  });

  it('with truthy simple relations', async () => {
    // handle relations in nested conditions (e.g. user.age > 18 -> { user: { age: { gt: 18 } } })
    const { result } = await checker(
      {
        spaceId: 'space-123',
        manufacturerId: 'not-1234',
        'user.profile.mantra': 'not-zen',
      },
      { id: '1234', spaceId: 'space-123' },
    );
    expect(result).toEqual(true);
  });

  it('comparison with unauthenticated user should result in an unsatisfied assertion', async () => {
    const { result } = await checker(
      { manufacturerId: 1234, 'user.profile.mantra': 'invalid' },
      { id: undefined },
    );
    expect(result).toEqual(false);
  });

  it('startsWith function in policy', async () => {
    const { result } = await checker({ inStock: false, status: 'stock' });
    expect(result).toEqual(true);
  });

  it('truthy Collection Predicate Expression', async () => {
    // @@allow('read', space.members?[user == auth()]

    const { result, assertions } = await checker(
      { spaceId: 123 },
      { id: 1, spaceId: 123 },
    );
    expect(result).toEqual(true);
  });

  it('falsy Collection Predicate Expression', async () => {
    const { result, assertions } = await checker(
      { spaceId: '123' },
      { id: 1, spaceId: '1234', age: 1 },
    );
    expect(result).toEqual(false);
  });

  it('startsWith function in args', async () => {
    const { result } = await checker(
      { manufacturerId: 1234, 'user.profile.mantra': { startsWith: 'ze' } },
      { id: undefined },
    );
    expect(result).toEqual(true);
  });

  it('truthy assertion with string condition in OR filter', async () => {
    const { result, assertions } = await checker(
      { OR: [{ status: 'test', 'user.age': 0 }] },
      // { age: 0 },
    );
    expect(result).toEqual(true);
  });
});

// TODO:
// Support for functions:
// - string: contains / search, startsWith, endsWith
// - array: has, hasEvery, hasSome, isEmpty, includes

// Note:

// if policy rules have no args, we could still add constraints to the user (and only it)
// e.g. @@allow('read', true)
// -> checker({ "user.age": {gt: 18}, price: 10 }, {user: {age: 15}} )
// -> price constraint not taken into account - would still be satisfied anyway

// @@allow('read', false) encoded in Z3 input => solver.add(false)

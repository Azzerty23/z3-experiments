// #################################################################################
// #                                                                               #
// #                                Permissions checker                            #
// #                                                                               #
// #################################################################################

// business rules:
// - alcohol forbidden for < 16 years old
// - alcohol level > 5° forbidden for < 18 years old
// -> alcohol level < 5° allowed between 16 and 18 years old

// zmodel policy rules:
// @@allow('read', ( status == "test" && age == 0 ) && ( manufacturer == auth() || auth().profile.mantra == "zen" ) && ( inStock || status == "restocking" || startsWith(status, "stock") ) && ( (auth().age >= 16 && alcoholLevel < 5) || auth().age >= 18) )
// @@allow('read', space.members?[user == auth()]

import * as util from 'util';

import { type Arith, type Bool, init, Context } from 'z3-solver';
import { killThreads } from './utils';

export async function checker(args: any, user?: any) {
  const checkedArgs = preprocessArgs(args, {
    // status: { OR: ["restocking", startsWith: 'stock'] },
    // 'user.profile.mantra': 'zen',
    // manufacturerId: user?.id,
    // spaceId: user?.spaceId ?? user?.space?.id,
  });
  const checkedArgsWithAuth = { ...checkedArgs, _withAuth: !!user?.id };
  console.log('args', util.formatWithOptions({ depth: 20 }, args));
  console.log(
    'checkedArgs',
    util.formatWithOptions({ depth: 20 }, checkedArgsWithAuth),
  );
  const { Context, em } = await init();
  const z3 = Context('main');
  const { Solver, Int, Bool, Or, And, Implies } = z3;

  // create variables
  const userAge = Int.const('user.age'); // to generate dynamically
  const userId = Int.const('user.id'); // to generate dynamically
  // const userProfileMantra = Bool.const('user.profile.mantra'); // to generate dynamically
  // const userProfileMantra = checkCondition(
  //   args?.['user.profile.mantra'] ?? user?.profile?.mantra,
  //   (v) => v === 'zen',
  // ); // to generate dynamically
  const alcoholLevel = Int.const('alcoholLevel'); // to generate dynamically
  const inStock = Bool.const('inStock'); // to generate dynamically
  // const status = Bool.const('status'); // to generate dynamically
  // const manufacturerId = Bool.const('manufacturerId'); // to generate dynamically
  const _withAuth = Bool.const('_withAuth');
  console.log(
    'checkCondition status test',
    checkCondition(args?.status, (v) => v === 'test'),
  );
  const variables = {
    userAge,
    userId,
    // userProfileMantra,
    alcoholLevel,
    inStock,
    // status,
    // manufacturerId,
    _withAuth,
  }; // to generate dynamically

  const solver = new Solver();
  const assertions = buildAssertions(variables, checkedArgsWithAuth, user, z3);
  solver.add(...assertions);
  // to generate dynamically
  solver.add(
    Or(
      And(
        checkCondition(args?.status, (v) => v === 'test', true),
        userAge.eq(0),
      ),
      checkCondition(
        args?.spaceId,
        (v) => v === user?.spaceId || v === user?.space?.id,
        !!_withAuth,
      ),
      And(
        Or(
          And(
            Bool.val(
              args?.manufacturerId ? args.manufacturerId === user?.id : true,
            ),
            _withAuth,
          ),
          checkCondition(
            args?.['user.profile.mantra'] ?? user?.profile?.mantra,
            (v) => v === 'zen',
          ),
          // userProfileMantra,
        ),
        And(
          Or(
            inStock,
            checkCondition(args?.status, (v) => v === 'restocking'),
            checkCondition(args?.status, (v) => v.startsWith('stock')),
            // Bool.val(args?.status ? args?.status?.startsWith('stock') : true),
          ),
          Or(userAge.ge(18), And(userAge.ge(16), alcoholLevel.lt(5))),
        ),
      ),
    ),
  );
  // solver.add(Bool.val(false));
  let solution: Record<string, string> = {};
  if ((await solver.check()) === 'sat') {
    const model = solver.model();
    model.decls().forEach((decl) => {
      solution[`${decl.name()}`] = `${model.get(decl)}`;
    });
    const formattedAssertions = assertions.map((a) => a.toString());
    await killThreads(em);
    console.log('solution', solution);
    console.log('assertions', formattedAssertions);
    return { result: true, assertions: formattedAssertions, solution };
  } else {
    console.error("couldn't find a solution");
    await killThreads(em);
    return { result: false };
  }
}

type Operator = 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge';
type NumericComparison = Partial<{ [k in Operator]: number }>;
type NumericCondition = NumericComparison | number;
type BoolCondition = boolean;
type StringCondition = string;
type Condition =
  | NumericCondition
  | BoolCondition
  | OrCondition
  | StringCondition;
type OrCondition = {
  OR: NumericCondition[] | StringCondition[] | OrCondition[];
};
type RangeFilter = Record<string, Condition>;
type OrFilter = { OR: RangeFilter[] | OrFilter[] };
type Filter = RangeFilter | OrFilter;
type Assertion = Bool<'main'>;
type NumberExpr = Arith<'main'>;
type Expr = NumberExpr | Assertion;

const processCondition = (
  variable: Expr,
  condition: Exclude<Condition, StringCondition>, // string conditions are processed as assertions
  z3: Context<'main'>,
): Assertion[] => {
  const assertions: Assertion[] = [];
  if (typeof condition === 'undefined' || typeof condition === 'string') {
    // noop
    // user properties are not pre-processed so we have to filter them out if string
  } else if (typeof condition === 'number') {
    assertions.push(variable.eq(condition));
  } else if (typeof condition === 'boolean') {
    assertions.push(variable.eq(condition));
  } else if ('OR' in condition) {
    const orCondition = condition;
    const tempAssertions: Assertion[] = [];
    for (const condition of orCondition.OR) {
      if (typeof condition === 'string') {
        // string are pre-processed and transformed as Assertion
        throw `Invalid OR condition for string ${condition}`;
      }
      tempAssertions.push(...processCondition(variable, condition, z3));
    }
    const orAssertion = z3.Or(...tempAssertions);
    assertions.push(orAssertion);
  } else if (z3.isBool(variable)) {
    assertions.push(variable);
  } else {
    const tempAssertions: Assertion[] = [];
    for (const [operator, value] of Object.entries(condition)) {
      switch (operator) {
        case 'eq':
          tempAssertions.push(variable.eq(value));
          break;
        case 'ne':
          tempAssertions.push(variable.neq(value));
          break;
        case 'lt':
          tempAssertions.push(variable.lt(value));
          break;
        case 'le':
          tempAssertions.push(variable.le(value));
          break;
        case 'gt':
          tempAssertions.push(variable.gt(value));
          break;
        case 'ge':
          tempAssertions.push(variable.ge(value));
          break;
        default:
          throw new Error('Invalid operator');
      }
    }

    // avoid empty assertions in case of comparison object like { ge: 1, le: 2 }
    if (tempAssertions.length > 1) {
      const andAssertion = z3.And(...tempAssertions);
      assertions.push(andAssertion);
    } else if (tempAssertions.length === 1) {
      assertions.push(...tempAssertions);
    }
  }
  return assertions;
};

const processFilter = (
  variables: Record<string, Expr>,
  z3: Context<'main'>,
  filter: Filter,
  isUserFilter = false,
): Assertion[] => {
  const assertions: Assertion[] = [];
  if ('OR' in filter) {
    const orFilter = filter as OrFilter;
    const tempAssertions: Assertion[] = [];
    for (const filter of orFilter.OR) {
      console.log('filter', filter, 'isUserFilter', isUserFilter);
      console.log(
        'variables',
        util.formatWithOptions({ depth: 20 }, variables),
      );

      tempAssertions.push(...processFilter(variables, z3, filter));
    }
    const orAssertion = z3.Or(...tempAssertions);
    assertions.push(orAssertion);
  }
  const tempAssertions: Assertion[] = [];
  for (const [property, condition] of Object.entries(filter)) {
    // TODO: handle nested properties
    const renamedProperty = isUserFilter ? `user.${property}` : property;
    const variable = variables[renamedProperty];
    if (variable) {
      tempAssertions.push(...processCondition(variable, condition, z3));
    }
  }
  // avoid empty assertions in case of unique value or boolean
  if (tempAssertions.length > 1) {
    const andAssertion = z3.And(...tempAssertions);
    assertions.push(andAssertion);
  } else if (tempAssertions.length === 1) {
    assertions.push(...tempAssertions);
  }

  return assertions;
};

export const buildAssertions = (
  variables: Record<string, Expr>,
  args: Filter = {},
  user: RangeFilter = {},
  z3: Context<'main'>,
): Assertion[] => {
  const variableRegistry = {} as Record<string, Expr>;
  for (const name in variables) {
    const realName = variables[name].name() as string;
    variableRegistry[realName] = variables[name];
  }

  const argsAssertions = processFilter(variableRegistry, z3, args);
  const userAssertions = processFilter(variableRegistry, z3, user, true);
  const assertions = [...argsAssertions, ...userAssertions];
  console.log(
    'assertions',
    assertions.map((a) => a.toString()),
  );
  return assertions;
};

const preprocessArgs = (
  args: any,
  literalChecks: Record<string, string | { startsWith: string }>,
  parent?: string,
) => {
  console.log('args', args, literalChecks, 'parent', parent);
  const result = {} as any;
  if (typeof args === 'string') {
    // { condition: { in: ['string', 'string'] } }
    return args === literalChecks[parent as keyof typeof literalChecks];
  }
  for (const key in args) {
    if (Array.isArray(args[key as keyof typeof args])) {
      result[key] = (args[key as keyof typeof args] as OrFilter[]).map((arg) =>
        preprocessArgs(arg, literalChecks, key === 'OR' ? parent : key),
      );
    } else if (typeof args[key as keyof typeof args] === 'object') {
      result[key] = preprocessArgs(
        args[key as keyof typeof args],
        literalChecks,
        key === 'OR' ? parent : key,
      );
    } else if (
      ['string', 'number'].includes(typeof args[key as keyof typeof args]) &&
      key in literalChecks
    ) {
      const valueToTransform = literalChecks[key];
      result[key] = args[key as keyof typeof args] === valueToTransform;
    } else {
      result[key] = args[key as keyof typeof args];
    }
  }
  return result;
};

const checkCondition = (
  // args: Filter,
  value:
    | string
    | number
    | boolean
    | { startsWith: string }
    | { in: string[] }
    | undefined,
  condition: (t: any) => boolean,
  mandatory = false,
): boolean => {
  if (value === undefined) return !mandatory;
  if (typeof value === 'string' || typeof value === 'number') {
    return condition(value);
  }
  if (typeof value === 'object' && 'startsWith' in value) {
    return condition(value.startsWith);
  }
  if (typeof value === 'object' && 'in' in value) {
    return value.in.some(condition);
  }
  if (typeof value === 'boolean') {
    return value;
  }
  return true;
};

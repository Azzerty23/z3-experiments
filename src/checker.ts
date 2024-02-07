// Example 1

// import { init } from "z3-solver";
// const { Context } = await init();
// const { Solver, Int, And } = Context("main");

// const x = Int.const("x");

// const solver = new Solver();
// solver.add(And(x.eq(0), x.ge(1), x.le(20)));
// console.log(await solver.check());
// try {
//   const model = solver.model();
//   console.log(model.get(x).toString());
// } catch (e: unknown) {
//   console.error(e instanceof Error ? e.message : e);
// }

// Example 2 (from chatGPT)

// import { init } from "z3-solver";
// const { Context } = await init();
// const { Solver, Int, And } = Context("main");

// // Create a Z3 context
// const solver = new Solver();

// // Define the variable x as an integer
// const x = Int.const("x");

// // Add the conditions to the solver
// solver.add(x.gt(18));
// solver.add(And(x.gt(1), x.lt(20)));

// // Check if the conditions are solvable
// const result = await solver.check();

// if (result === "sat") {
//   // If solvable, get the model
//   const model = solver.model();
//   // Print the satisfying assignment for x
//   console.log("Satisfying assignment for x:", model.eval(x, true).toString());
// } else {
//   console.log("Conditions are not solvable.");
// }

// Example 3 (from the source code)

// import { init } from "z3-solver";
// const { Context, em } = await init();
// const { Solver, Int } = Context("main");
// const x = Int.const("x");
// const y = Int.const("y");
// const solver = new Solver();
// solver.add(x.add(2).le(y.sub(10))); // x + 2 <= y - 10
// if ((await solver.check()) !== "sat") {
//   throw new Error("couldn't find a solution");
// }
// const model = solver.model();
// console.log(`x=${model.get(x)}, y=${model.get(y)}`);
// // x=0, y=12
// // exit process: https://github.com/Z3Prover/z3/issues/7070#issuecomment-1871017371
// em.PThread.terminateAllThreads();

// Example 4 (updated example 3 with IIFE like in the official example)
// https://github.com/Z3Prover/z3/blob/master/src/api/js/examples/high-level/using_smtlib2.ts

// import process from "process";
// import { init } from "z3-solver";

// (async () => {
//   const { Context } = await init();
//   const { Solver, Int } = Context("main");
//   const x = Int.const("x");
//   const y = Int.const("y");
//   const solver = new Solver();
//   solver.add(x.add(2).le(y.sub(10))); // x + 2 <= y - 10
//   if ((await solver.check()) !== "sat") {
//     throw new Error("couldn't find a solution");
//   }
//   const model = solver.model();
//   console.log(`x=${model.get(x)}, y=${model.get(y)}`);
//   // x=0, y=12
//   process.exit(0);
// })().catch((e) => {
//   console.error("error", e);
//   process.exit(1);
// });

// Example 5 (from https://microsoft.github.io/z3guide/programming/Z3%20JavaScript%20Examples)

// import { init } from "z3-solver";
// const { Context } = await init();
// const { Bool, Or, Implies, Not, solve } = Context("main");

// const [tie, shirt] = [Bool.const("tie"), Bool.const("shirt")];
// const result = await solve(
//   Or(tie, shirt),
//   Implies(tie, shirt),
//   Or(Not(tie), Not(shirt))
// );
// console.log(result.toString());
// // (define-fun tie () Bool
// //   false)
// // (define-fun shirt () Bool
// //   true)
// process.exit(0);

// Example 6 (inside child process)

// import { spawn } from "child_process";

// const command = "node";
// const scriptPath = "./dist/childProcess";
// const args = [scriptPath];

// // Spawn the child process
// // const result = spawnSync(command, args);
// // console.log(result.output.toString());
// const childProcess = spawn(command, args);

// // Listen for output events
// childProcess.stdout.on("data", (data) => {
//   console.log(`stdout: ${data}`);
// });

// childProcess.stderr.on("data", (data) => {
//   console.error(`stderr: ${data}`);
// });

// console.log("Hello after exited child process");

// #################################################################################
// #                                                                               #
// #                                 Permission checker                            #
// #                                                                               #
// #################################################################################

// business rules:
// - alcohol forbidden for < 16 years old
// - alcohol level > 5° forbidden for < 18 years old
// -> alcohol level < 5° allowed between 16 and 18 years old

// zmodel policy rules:
// @@allow('read', ( manufacturer == auth() || auth().profile.mantra == "zen" ) && ( inStock || status == "restocking" ) && ( (auth().age >= 16 && alcoholLevel < 5) || auth().age >= 18) )

import * as util from 'util';

import { type Arith, type Bool, init, Context } from 'z3-solver';
import { killThreads } from './utils';

const preprocessArgs = (
  args: any,
  literalChecks: Record<string, string>,
  parent?: string,
) => {
  const result = {} as any;
  if (typeof args === 'string') {
    // { condition: { OR: ['string', 'string'] } }
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
    } else if (typeof args[key as keyof typeof args] === 'string') {
      const valueToTransform = literalChecks[key];
      result[key] = args[key as keyof typeof args] === valueToTransform;
    } else {
      result[key] = args[key as keyof typeof args];
    }
  }
  return result;
};

export async function checker(args: Filter, user?: any) {
  const checkedArgs = preprocessArgs(args, {
    status: 'restocking',
    'user.profile.mantra': 'zen',
  });
  const checkedArgsWithAuth = { ...checkedArgs, _withAuth: !!user?.id };
  console.log('args', util.formatWithOptions({ depth: 20 }, args));
  console.log(
    'checkedArgs',
    util.formatWithOptions({ depth: 20 }, checkedArgsWithAuth),
  );
  const { Context, em } = await init();
  const z3 = Context('main');
  const { Solver, Int, Bool, Or, And } = z3;

  // create variables
  const userAge = Int.const('user.age'); // to generate dynamically
  const userId = Int.const('user.id'); // to generate dynamically
  const userProfileMantra = Bool.const('user.profile.mantra'); // to generate dynamically
  const alcoholLevel = Int.const('alcoholLevel'); // to generate dynamically
  const inStock = Bool.const('inStock'); // to generate dynamically
  const status = Bool.const('status'); // to generate dynamically
  const manufacturerId = Int.const('manufacturerId'); // to generate dynamically
  const _withAuth = Bool.const('_withAuth');
  const variables = {
    userAge,
    userId,
    userProfileMantra,
    alcoholLevel,
    inStock,
    status,
    manufacturerId,
    _withAuth,
  }; // to generate dynamically

  const solver = new Solver();
  const assertions = buildAssertions(variables, checkedArgsWithAuth, user, z3);
  solver.add(...assertions);
  // to generate dynamically
  solver.add(
    Or(And(userId.eq(manufacturerId), _withAuth), userProfileMantra),
    And(
      Or(inStock, status),
      Or(userAge.ge(18), And(userAge.ge(16), alcoholLevel.lt(5))),
    ),
  );
  let solution: Record<string, string> = {};
  if ((await solver.check()) === 'sat') {
    const model = solver.model();
    model.decls().forEach((decl) => {
      solution[`${decl.name()}`] = `${model.get(decl)}`;
    });
    const formattedAssertions = assertions.map((a) => a.toString());
    await killThreads(em);
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
  if (typeof condition === 'undefined') {
    // noop
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

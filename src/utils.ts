function delay(ms: number): Promise<void> & { cancel(): void };
function delay(ms: number, result: Error): Promise<never> & { cancel(): void };
function delay<T>(ms: number, result: T): Promise<T> & { cancel(): void };
function delay<T>(
  ms: number,
  result?: T | Error,
): Promise<T | void> & { cancel(): void } {
  let handle: any;
  const promise = new Promise<void | T>(
    (resolve, reject) =>
      (handle = setTimeout(() => {
        if (result instanceof Error) {
          reject(result);
        } else if (result !== undefined) {
          resolve(result);
        }
        resolve();
      }, ms)),
  );
  return { ...promise, cancel: () => clearTimeout(handle) };
}

function waitWhile(
  premise: () => boolean,
  pollMs = 100,
): Promise<void> & { cancel(): void } {
  let handle: any;
  const promise = new Promise<void>((resolve) => {
    handle = setInterval(() => {
      if (premise()) {
        clearTimeout(handle);
        resolve();
      }
    }, pollMs);
  });
  return { ...promise, cancel: () => clearInterval(handle) };
}

// exit process: https://github.com/Z3Prover/z3/issues/7070#issuecomment-1871017371
export function killThreads(em: any): Promise<void> {
  em.PThread.terminateAllThreads();

  // Create a polling lock to wait for threads to return
  // TODO(ritave): Threads should be killed automatically, or there should be a better way to wait for them
  const lockPromise = waitWhile(
    () => !em.PThread.unusedWorkers.length && !em.PThread.runningWorkers.length,
  );
  const delayPromise = delay(
    5000,
    new Error('Waiting for threads to be killed timed out'),
  );

  return Promise.race([lockPromise, delayPromise]).finally(() => {
    lockPromise.cancel();
    delayPromise.cancel();
  });
}

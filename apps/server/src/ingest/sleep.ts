/** A pause on a real timer; the retrying code takes it as the default and tests inject a stub. */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

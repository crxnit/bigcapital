/**
 * Browser shim for the `chalk` CLI color package.
 *
 * `stylis-rtlcss` depends on `rtlcss`, which imports `chalk` for
 * terminal output in its CLI. When bundled for the browser, Vite
 * externalizes `chalk` and emits a runtime warning on every access
 * ("Module chalk has been externalized for browser compatibility").
 *
 * Nothing in the browser consumes colored strings, so this shim
 * returns the input unchanged for any property chain that ends in
 * a function call: `chalk.cyan('x')`, `chalk.red.bold('x')`, etc.
 */
type ChalkFn = ((...args: unknown[]) => string) & { [key: string]: ChalkFn };

const identity = ((...args: unknown[]) => args.map((a) => String(a)).join(' ')) as ChalkFn;

const createChainable = (): ChalkFn =>
  new Proxy(identity, {
    get: (_target, prop) => (prop === 'then' ? undefined : createChainable()),
  });

const chalk = createChainable();

export default chalk;
export const {
  black, red, green, yellow, blue, magenta, cyan, white, gray, grey,
  bold, dim, italic, underline, inverse, hidden, strikethrough, reset,
} = new Proxy({} as Record<string, ChalkFn>, {
  get: () => createChainable(),
});

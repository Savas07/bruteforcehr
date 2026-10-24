/**
 * The WHATWG `URL` class (Node, browsers). @bfhr/core compiles without DOM or Node libraries (its
 * consumers choose theirs), so the members URL import uses are typed here once.
 */
export interface WebUrl {
  href: string;
  protocol: string;
  username: string;
  password: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
  readonly origin: string;
  readonly searchParams: {
    get(name: string): string | null;
    keys(): Iterable<string>;
    delete(name: string): void;
  };
}

type WebUrlConstructor = new (input: string, base?: string) => WebUrl;

// Every runtime core runs on (Node 22, WebKit, Chromium) has the global; only its type is missing.
const globals: { URL: WebUrlConstructor } = globalThis as unknown as { URL: WebUrlConstructor };
export const WebUrl: WebUrlConstructor = globals.URL;

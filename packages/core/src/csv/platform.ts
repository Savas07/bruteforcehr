/**
 * The two WHATWG globals the CSV code uses. Every runtime BruteForceHR runs core in has them
 * (webviews, Node 22, Cloud Functions), but the ES library types don't declare them, and core is
 * typechecked without DOM or Node types (its consumers compile its source with their own config).
 */
interface TextDecoderLike {
  decode(input: Uint8Array): string;
}
interface UrlLike {
  readonly protocol: string;
  readonly href: string;
}

const platform = globalThis as unknown as {
  readonly TextDecoder: new (
    label: string,
    options: { fatal: boolean; ignoreBOM: boolean },
  ) => TextDecoderLike;
  readonly URL: new (input: string) => UrlLike;
};

export const PlatformTextDecoder = platform.TextDecoder;
export const PlatformUrl = platform.URL;

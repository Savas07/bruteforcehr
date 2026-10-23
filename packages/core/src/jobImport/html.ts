/**
 * A small, forgiving HTML parser for job pages: enough of HTML's tokenizer and tree rules to read
 * JSON-LD, microdata, meta tags and the visible text of real-world markup. It is not a full
 * HTML5 tree builder (no adoption agency, no foster parenting); unmatched end tags are ignored and
 * a few elements close implicitly.
 */

export interface HtmlElement {
  readonly type: "element";
  /** Lower-case tag name; `#document` for the root. */
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: HtmlNode[];
  readonly parent: HtmlElement | null;
}

export interface HtmlText {
  readonly type: "text";
  readonly text: string;
}

export type HtmlNode = HtmlElement | HtmlText;

/** A static lookup table of tag (or entity) names. */
const names = (...list: string[]): Readonly<Record<string, true>> =>
  Object.fromEntries(list.map((name) => [name, true]));

const VOID = names(
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
);

/** Content is raw text up to the matching end tag. */
const RAW_TEXT = names("script", "style", "textarea", "title", "noscript", "xmp", "iframe", "noembed", "template");
/** Raw text elements whose content is still entity-decoded. */
const ESCAPABLE_RAW_TEXT = names("textarea", "title");

/** Opening one of these closes an open element of the same tag on top of the stack. */
const SELF_NESTING_CLOSES = names("li", "dt", "dd", "tr", "td", "th", "option");

/** Block elements that end an open `<p>`. */
const CLOSES_P = names(
  "address",
  "article",
  "aside",
  "blockquote",
  "div",
  "dl",
  "fieldset",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "ul",
);

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  ensp: "\u2002",
  emsp: "\u2003",
  thinsp: "\u2009",
  zwnj: "\u200c",
  zwj: "\u200d",
  shy: "\u00ad",
  copy: "©",
  reg: "®",
  trade: "™",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  minus: "−",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  laquo: "«",
  raquo: "»",
  bull: "•",
  middot: "·",
  euro: "€",
  pound: "£",
  yen: "¥",
  cent: "¢",
  sect: "§",
  para: "¶",
  deg: "°",
  plusmn: "±",
  times: "×",
  divide: "÷",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  sup2: "²",
  sup3: "³",
  micro: "µ",
  iexcl: "¡",
  iquest: "¿",
  rarr: "→",
  larr: "←",
  check: "✓",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  szlig: "ß",
  ccedil: "ç",
  Ccedil: "Ç",
  gbreve: "ğ",
  Gbreve: "Ğ",
  scedil: "ş",
  Scedil: "Ş",
  imath: "ı",
  inodot: "ı",
  Idot: "İ",
  aacute: "á",
  Aacute: "Á",
  agrave: "à",
  Agrave: "À",
  acirc: "â",
  Acirc: "Â",
  atilde: "ã",
  aring: "å",
  Aring: "Å",
  aelig: "æ",
  AElig: "Æ",
  eacute: "é",
  Eacute: "É",
  egrave: "è",
  Egrave: "È",
  ecirc: "ê",
  Ecirc: "Ê",
  euml: "ë",
  iacute: "í",
  Iacute: "Í",
  igrave: "ì",
  icirc: "î",
  Icirc: "Î",
  iuml: "ï",
  ntilde: "ñ",
  Ntilde: "Ñ",
  oacute: "ó",
  Oacute: "Ó",
  ograve: "ò",
  ocirc: "ô",
  Ocirc: "Ô",
  otilde: "õ",
  oslash: "ø",
  Oslash: "Ø",
  uacute: "ú",
  Uacute: "Ú",
  ugrave: "ù",
  ucirc: "û",
  Ucirc: "Û",
  yacute: "ý",
  yuml: "ÿ",
  scaron: "š",
  Scaron: "Š",
  zcaron: "ž",
  Zcaron: "Ž",
  oelig: "œ",
  OElig: "Œ",
};

/** Entities browsers also accept without the trailing semicolon. */
const LEGACY_ENTITIES = names("amp", "lt", "gt", "quot", "nbsp", "copy", "reg");

/** Decodes character references (`&amp;`, `&#246;`, `&#x27;`, `&nbsp`). */
export function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(/&(#[xX][0-9a-fA-F]{1,6};?|#[0-9]{1,7};?|[a-zA-Z][a-zA-Z0-9]{1,31};?)/g, (match, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(body.slice(hex ? 2 : 1).replace(";", ""), hex ? 16 : 10);
      if (!Number.isFinite(code) || code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
        return "\ufffd";
      }
      return String.fromCodePoint(code);
    }
    const terminated = body.endsWith(";");
    const name = terminated ? body.slice(0, -1) : body;
    const value = NAMED_ENTITIES[name];
    if (value !== undefined && (terminated || LEGACY_ENTITIES[name] === true)) return value;
    return match;
  });
}

interface MutableElement {
  type: "element";
  tag: string;
  attrs: Record<string, string>;
  children: HtmlNode[];
  parent: MutableElement | null;
}

const TAG_NAME = /^[a-zA-Z][a-zA-Z0-9:-]*/;

/** Parses attributes from `source` starting at `start` until the tag's `>`; returns them and the index after `>`. */
function readAttributes(source: string, start: number): { attrs: Record<string, string>; end: number; selfClosing: boolean } {
  const attrs: Record<string, string> = {};
  let i = start;
  let selfClosing = false;
  const length = source.length;
  while (i < length) {
    const char = source[i];
    if (char === ">") return { attrs, end: i + 1, selfClosing };
    if (char === "/" ) {
      selfClosing = source[i + 1] === ">";
      i++;
      continue;
    }
    if (char === " " || char === "\n" || char === "\t" || char === "\r" || char === "\f") {
      i++;
      continue;
    }
    let nameEnd = i;
    while (nameEnd < length && !/[\s=>/]/.test(source[nameEnd] ?? "")) nameEnd++;
    if (nameEnd === i) nameEnd = i + 1;
    const name = source.slice(i, nameEnd).toLowerCase();
    i = nameEnd;
    while (i < length && /\s/.test(source[i] ?? "")) i++;
    let value = "";
    if (source[i] === "=") {
      i++;
      while (i < length && /\s/.test(source[i] ?? "")) i++;
      const quote = source[i];
      if (quote === '"' || quote === "'") {
        const close = source.indexOf(quote, i + 1);
        const valueEnd = close === -1 ? length : close;
        value = source.slice(i + 1, valueEnd);
        i = valueEnd + 1;
      } else {
        let valueEnd = i;
        while (valueEnd < length && !/[\s>]/.test(source[valueEnd] ?? "")) valueEnd++;
        value = source.slice(i, valueEnd);
        i = valueEnd;
      }
    }
    if (!(name in attrs)) attrs[name] = decodeEntities(value);
  }
  return { attrs, end: length, selfClosing };
}

/** Parses an HTML document or fragment into a tree rooted at a `#document` element. */
export function parseHtml(source: string): HtmlElement {
  const root: MutableElement = { type: "element", tag: "#document", attrs: {}, children: [], parent: null };
  const stack: MutableElement[] = [root];
  const current = (): MutableElement => stack[stack.length - 1] ?? root;
  const pushText = (text: string): void => {
    if (text !== "") current().children.push({ type: "text", text });
  };
  const closeTo = (tag: string): void => {
    for (let depth = stack.length - 1; depth > 0; depth--) {
      if (stack[depth]?.tag === tag) {
        stack.length = depth;
        return;
      }
    }
  };

  let i = 0;
  const length = source.length;
  while (i < length) {
    const lt = source.indexOf("<", i);
    if (lt === -1) {
      pushText(decodeEntities(source.slice(i)));
      break;
    }
    if (lt > i) pushText(decodeEntities(source.slice(i, lt)));
    i = lt;
    if (source.startsWith("<!--", i)) {
      const end = source.indexOf("-->", i + 4);
      i = end === -1 ? length : end + 3;
      continue;
    }
    const next = source[i + 1];
    if (next === "!" || next === "?") {
      const end = source.indexOf(">", i);
      i = end === -1 ? length : end + 1;
      continue;
    }
    if (next === "/") {
      const name = TAG_NAME.exec(source.slice(i + 2, i + 66))?.[0];
      const end = source.indexOf(">", i);
      i = end === -1 ? length : end + 1;
      if (name !== undefined) closeTo(name.toLowerCase());
      continue;
    }
    const name = TAG_NAME.exec(source.slice(i + 1, i + 65))?.[0];
    if (name === undefined) {
      pushText("<");
      i++;
      continue;
    }
    const tag = name.toLowerCase();
    const { attrs, end, selfClosing } = readAttributes(source, i + 1 + name.length);
    i = end;

    const top = current();
    if (SELF_NESTING_CLOSES[tag] === true && top.tag === tag) stack.pop();
    else if (CLOSES_P[tag] === true && top.tag === "p") stack.pop();

    const element: MutableElement = { type: "element", tag, attrs, children: [], parent: current() };
    current().children.push(element);
    if (VOID[tag] === true || selfClosing) continue;
    if (RAW_TEXT[tag] === true) {
      const close = new RegExp(`</${tag}\\s*>`, "i");
      const rest = source.slice(i);
      const match = close.exec(rest);
      const raw = match === null ? rest : rest.slice(0, match.index);
      if (raw !== "") element.children.push({ type: "text", text: ESCAPABLE_RAW_TEXT[tag] === true ? decodeEntities(raw) : raw });
      i = match === null ? length : i + match.index + match[0].length;
      continue;
    }
    stack.push(element);
  }
  return root;
}

/** Depth-first walk over the elements below `node` (excluding `node`). */
export function* elements(node: HtmlElement): Generator<HtmlElement> {
  for (const child of node.children) {
    if (child.type !== "element") continue;
    yield child;
    yield* elements(child);
  }
}

export function findAll(node: HtmlElement, predicate: (element: HtmlElement) => boolean): HtmlElement[] {
  const found: HtmlElement[] = [];
  for (const element of elements(node)) if (predicate(element)) found.push(element);
  return found;
}

export function find(node: HtmlElement, predicate: (element: HtmlElement) => boolean): HtmlElement | undefined {
  for (const element of elements(node)) if (predicate(element)) return element;
  return undefined;
}

export function hasClass(element: HtmlElement, name: string): boolean {
  const value = element.attrs.class;
  return value !== undefined && value.split(/\s+/).includes(name);
}

/** Raw (undecoded for scripts) text inside an element, concatenated. */
export function rawText(node: HtmlElement): string {
  return node.children.map((child) => (child.type === "text" ? child.text : rawText(child))).join("");
}

const SKIPPED_IN_TEXT = names("script", "style", "noscript", "template", "svg", "iframe", "head", "button", "select");
const PARAGRAPH_BLOCKS = names(
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "dl",
  "table",
  "blockquote",
  "pre",
  "section",
  "article",
);
const LINE_BLOCKS = names(
  "div",
  "tr",
  "dt",
  "dd",
  "header",
  "footer",
  "main",
  "aside",
  "nav",
  "form",
  "fieldset",
  "address",
  "figure",
  "figcaption",
  "hr",
  "body",
  "html",
);

/** Single-line text of an element: whitespace collapsed, trimmed. */
export function textOf(node: HtmlElement | undefined): string {
  if (node === undefined) return "";
  return rawTextVisible(node).replace(/[\s\u00a0]+/g, " ").trim();
}

function rawTextVisible(node: HtmlElement): string {
  return node.children
    .map((child) => {
      if (child.type === "text") return child.text;
      if (SKIPPED_IN_TEXT[child.tag] === true) return "";
      if (child.tag === "br") return " ";
      return rawTextVisible(child) + (LINE_BLOCKS[child.tag] === true || PARAGRAPH_BLOCKS[child.tag] === true ? " " : "");
    })
    .join("");
}


/**
 * Readable plain text with paragraph breaks: paragraphs and headings are separated by a blank
 * line, list items start with "• ", `<br>` breaks a line. Scripts, styles and controls are dropped.
 */
export function blockText(node: HtmlElement, skip: (element: HtmlElement) => boolean = () => false): string {
  const parts: string[] = [];
  const visit = (element: HtmlElement): void => {
    for (const child of element.children) {
      if (child.type === "text") {
        parts.push(child.text.replace(/[\s\u00a0]+/g, " "));
        continue;
      }
      if (SKIPPED_IN_TEXT[child.tag] === true || skip(child)) continue;
      if (child.tag === "br") {
        parts.push("\n");
        continue;
      }
      if (child.tag === "li") {
        parts.push("\n• ");
        visit(child);
        parts.push("\n");
        continue;
      }
      if (child.tag === "td" || child.tag === "th") {
        visit(child);
        parts.push(" ");
        continue;
      }
      const separator =
        PARAGRAPH_BLOCKS[child.tag] === true ? "\n\n" : LINE_BLOCKS[child.tag] === true ? "\n" : "";
      parts.push(separator);
      visit(child);
      parts.push(separator);
    }
  };
  visit(node);
  return parts
    .join("")
    .split("\n")
    .map((line) => line.replace(/ +/g, " ").trim())
    .join("\n")
    .replace(/^(• *\n)+/gm, "")
    .replace(/\n• *(?=\n)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** `<meta name|property="key" content>` lookup (first match). */
export function metaContent(document: HtmlElement, key: string): string | undefined {
  const lower = key.toLowerCase();
  const meta = find(
    document,
    (element) =>
      element.tag === "meta" &&
      ((element.attrs.property ?? element.attrs.name ?? element.attrs.itemprop)?.toLowerCase() === lower),
  );
  const content = meta?.attrs.content?.trim();
  return content === undefined || content === "" ? undefined : content;
}

/** `<link rel="canonical" href>` resolved against `base`, if it is http(s). */
export function canonicalUrl(document: HtmlElement, base: string): string | undefined {
  const link = find(
    document,
    (element) => element.tag === "link" && (element.attrs.rel ?? "").toLowerCase().split(/\s+/).includes("canonical"),
  );
  const href = link?.attrs.href;
  if (href === undefined || href.trim() === "") return undefined;
  try {
    const url = new URL(href.trim(), base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

type ParseError = {
  message: string;
  index: number;
  line: number;
  column: number;
};

export type OdooManifest = {
  [key: string]: unknown;
  name?: string;
  version?: string;
  depends?: string[];
  data?: string[];
  demo?: string[];
  installable?: boolean;
  application?: boolean;
  license?: string;
};

export type ParseManifestResult =
  | { ok: true; manifest: OdooManifest }
  | { ok: false; error: string };

type ParserState = {
  index: number;
  line: number;
  column: number;
};

function createParserState(content: string) {
  return {
    content,
    parser: {
      index: 0,
      line: 1,
      column: 1,
    } satisfies ParserState,
  };
}

function makeError(state: ParserState, message: string): ParseError {
  return { message, index: state.index, line: state.line, column: state.column };
}

function throwParseError(state: ParserState, message: string): never {
  const { line, column } = makeError(state, message);
  throw new Error(`Parse error at ${line}:${column}: ${message}`);
}

function isWhitespace(char: string): boolean {
  return /\s/u.test(char);
}

function peek(state: ParserState, content: string, offset = 0): string {
  return content[state.index + offset] ?? '';
}

function consumeChar(state: ParserState, content: string): string {
  const char = peek(state, content);
  if (char === '') {
    return '';
  }
  state.index += 1;
  if (char === '\n') {
    state.line += 1;
    state.column = 1;
  } else {
    state.column += 1;
  }
  return char;
}

function skipWhitespaceAndComments(state: ParserState, content: string): void {
  while (state.index < content.length) {
    const char = peek(state, content);
    if (isWhitespace(char)) {
      consumeChar(state, content);
      continue;
    }
    if (char === '#') {
      while (state.index < content.length && peek(state, content) !== '\n') {
        consumeChar(state, content);
      }
      continue;
    }
    break;
  }
}

function parseString(state: ParserState, content: string): string {
  const quote = consumeChar(state, content);
  const chars: string[] = [];

  while (state.index < content.length) {
    const char = consumeChar(state, content);
    if (char === '\\') {
      const escaped = consumeChar(state, content);
      if (!escaped) {
        throwParseError(state, 'unterminated string escape');
      }
      if (escaped === 'n') {
        chars.push('\n');
      } else if (escaped === 'r') {
        chars.push('\r');
      } else if (escaped === 't') {
        chars.push('\t');
      } else if (escaped === quote) {
        chars.push(quote);
      } else if (escaped === '\\') {
        chars.push('\\');
      } else {
        chars.push(escaped);
      }
      continue;
    }
    if (char === quote) {
      return chars.join('');
    }
    if (char === '\n' || char === '\r') {
      throwParseError(state, 'unterminated string literal');
    }
    chars.push(char);
  }

  throwParseError(state, 'unterminated string literal');
}

function parseIdentifier(state: ParserState, content: string): string {
  const chars: string[] = [];
  const start = state.index;
  const first = peek(state, content);
  if (!/[A-Za-z_]/u.test(first)) {
    throwParseError(state, 'expected identifier');
  }
  chars.push(consumeChar(state, content));

  while (state.index < content.length) {
    const char = peek(state, content);
    if (/[A-Za-z0-9_]/u.test(char)) {
      chars.push(consumeChar(state, content));
      continue;
    }
    break;
  }

  if (chars.length === 0) {
    throwParseError(state, 'expected identifier at ' + start);
  }
  return chars.join('');
}

function parseNumber(state: ParserState, content: string): number {
  const chars: string[] = [];
  if (peek(state, content) === '-') {
    chars.push(consumeChar(state, content));
  }

  while (/[0-9]/u.test(peek(state, content))) {
    chars.push(consumeChar(state, content));
  }

  if (peek(state, content) === '.') {
    chars.push(consumeChar(state, content));
    if (!/[0-9]/u.test(peek(state, content))) {
      throwParseError(state, 'invalid numeric literal');
    }
    while (/[0-9]/u.test(peek(state, content))) {
      chars.push(consumeChar(state, content));
    }
  }

  const value = Number(chars.join(''));
  if (!Number.isFinite(value)) {
    throwParseError(state, 'invalid numeric literal');
  }
  return value;
}

function parseValue(state: ParserState, content: string): unknown {
  skipWhitespaceAndComments(state, content);
  const char = peek(state, content);

  if (char === '{') {
    return parseObject(state, content);
  }
  if (char === '[') {
    return parseList(state, content);
  }
  if (char === '"' || char === "'") {
    return parseString(state, content);
  }
  if (char === '-' || /[0-9]/u.test(char)) {
    return parseNumber(state, content);
  }
  if (/[A-Za-z_]/u.test(char)) {
    const identifier = parseIdentifier(state, content);
    if (identifier === 'True') return true;
    if (identifier === 'False') return false;
    if (identifier === 'None') return undefined;
    throwParseError(state, `unsupported identifier '${identifier}'`);
  }

  throwParseError(state, `unexpected character '${char || 'EOF'}'`);
}

function expectChar(state: ParserState, content: string, expected: string): void {
  skipWhitespaceAndComments(state, content);
  const char = consumeChar(state, content);
  if (char !== expected) {
    throwParseError(state, `expected '${expected}' but found '${char || 'EOF'}'`);
  }
}

function parseList(state: ParserState, content: string): unknown[] {
  expectChar(state, content, '[');
  const values: unknown[] = [];

  skipWhitespaceAndComments(state, content);
  if (peek(state, content) === ']') {
    consumeChar(state, content);
    return values;
  }

  while (state.index < content.length) {
    const value = parseValue(state, content);
    values.push(value);

    skipWhitespaceAndComments(state, content);
    if (peek(state, content) === ',') {
      consumeChar(state, content);
      skipWhitespaceAndComments(state, content);
      if (peek(state, content) === ']') {
        consumeChar(state, content);
        return values;
      }
      continue;
    }
    if (peek(state, content) === ']') {
      consumeChar(state, content);
      return values;
    }
    throwParseError(state, "expected ',' or ']'");
  }

  throwParseError(state, 'unterminated list literal');
}

function parseObject(state: ParserState, content: string): Record<string, unknown> {
  expectChar(state, content, '{');
  const manifest: Record<string, unknown> = {};
  skipWhitespaceAndComments(state, content);

  if (peek(state, content) === '}') {
    consumeChar(state, content);
    return manifest;
  }

  while (state.index < content.length) {
    skipWhitespaceAndComments(state, content);
    const key = parseManifestKey(state, content);
    skipWhitespaceAndComments(state, content);
    expectChar(state, content, ':');
    const value = parseValue(state, content);
    manifest[key] = value;

    skipWhitespaceAndComments(state, content);
    if (peek(state, content) === ',') {
      consumeChar(state, content);
      skipWhitespaceAndComments(state, content);
      if (peek(state, content) === '}') {
        consumeChar(state, content);
        return manifest;
      }
      continue;
    }
    if (peek(state, content) === '}') {
      consumeChar(state, content);
      return manifest;
    }

    throwParseError(state, "expected ',' or '}'");
  }

  throwParseError(state, 'unterminated object literal');
}

function parseManifestKey(state: ParserState, content: string): string {
  skipWhitespaceAndComments(state, content);
  const char = peek(state, content);
  if (char !== '"' && char !== "'") {
    throwParseError(state, 'manifest keys must be quoted');
  }
  return parseString(state, content);
}

function validateManifest(manifest: Record<string, unknown>): OdooManifest {
  if (manifest.name !== undefined && typeof manifest.name !== 'string') {
    throw new Error('invalid manifest: name must be a string');
  }
  if (manifest.version !== undefined && typeof manifest.version !== 'string') {
    throw new Error('invalid manifest: version must be a string');
  }
  if (manifest.license !== undefined && typeof manifest.license !== 'string') {
    throw new Error('invalid manifest: license must be a string');
  }
  if (manifest.application !== undefined && typeof manifest.application !== 'boolean') {
    throw new Error('invalid manifest: application must be a boolean');
  }
  if (manifest.installable !== undefined && typeof manifest.installable !== 'boolean') {
    throw new Error('invalid manifest: installable must be a boolean');
  }
  if (manifest.depends !== undefined && !Array.isArray(manifest.depends)) {
    throw new Error('invalid manifest: depends must be a list of strings');
  }
  if (manifest.data !== undefined && !Array.isArray(manifest.data)) {
    throw new Error('invalid manifest: data must be a list of strings');
  }
  if (manifest.demo !== undefined && !Array.isArray(manifest.demo)) {
    throw new Error('invalid manifest: demo must be a list of strings');
  }

  if (Array.isArray(manifest.depends) && !manifest.depends.every((entry) => typeof entry === 'string')) {
    throw new Error('invalid manifest: depends must be a list of strings');
  }
  if (Array.isArray(manifest.data) && !manifest.data.every((entry) => typeof entry === 'string')) {
    throw new Error('invalid manifest: data must be a list of strings');
  }
  if (Array.isArray(manifest.demo) && !manifest.demo.every((entry) => typeof entry === 'string')) {
    throw new Error('invalid manifest: demo must be a list of strings');
  }

  return manifest as OdooManifest;
}

export function parseOdooManifest(content: string): ParseManifestResult {
  try {
    const { content: sourceContent, parser } = createParserState(content);
    const manifest = parseValue(parser, sourceContent);

    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      return { ok: false, error: 'Invalid manifest: top-level value must be a dictionary literal' };
    }

    skipWhitespaceAndComments(parser, sourceContent);
    if (parser.index < sourceContent.length) {
      return {
        ok: false,
        error: `Invalid manifest: trailing content after top-level object at line ${parser.line}, column ${parser.column}`,
      };
    }

    return {
      ok: true,
      manifest: validateManifest(manifest as Record<string, unknown>),
    };
  } catch (error) {
    if (error instanceof Error) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: 'Invalid manifest content' };
  }
}

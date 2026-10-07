export interface BootstrapAcknowledgment { v: 1; type: 'DELIVERED'; id: string; nonce: string; digest: string }
export type ExpectedBootstrapAcknowledgment = Pick<BootstrapAcknowledgment, 'id' | 'nonce' | 'digest'>;
const failure = () => new Error('Bootstrap acknowledgment unavailable.');

/** The acknowledgment is deliberately a flat object, not arbitrary nested JSON. */
function parseAcknowledgment(text: string): Record<string, unknown> {
  let at = 0;
  const fields: Record<string, unknown> = Object.create(null);
  const whitespace = () => { while (/[ \t\r]/.test(text[at] || '\0')) at++; };
  const string = () => {
    const match = /"(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y;
    match.lastIndex = at;
    const value = match.exec(text);
    if (!value) throw failure();
    at = match.lastIndex;
    return JSON.parse(value[0]) as string;
  };
  whitespace(); if (text[at++] !== '{') throw failure(); whitespace();
  if (text[at] !== '}') while (true) {
    const key = string();
    if (Object.hasOwn(fields, key)) throw failure();
    whitespace(); if (text[at++] !== ':') throw failure(); whitespace();
    if (text[at] === '"') fields[key] = string();
    else {
      const number = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
      number.lastIndex = at; const value = number.exec(text);
      if (!value) throw failure(); at = number.lastIndex; fields[key] = JSON.parse(value[0]);
    }
    whitespace();
    if (text[at] === '}') break;
    if (text[at++] !== ',') throw failure(); whitespace();
  }
  if (text[at++] !== '}') throw failure(); whitespace();
  if (at !== text.length) throw failure();
  return fields;
}

/** Exactly one newline-terminated UTF-8 frame, at most 4 KB total output. */
export class BootstrapAckDecoder {
  #buffer = Buffer.alloc(0);
  #ack: BootstrapAcknowledgment | undefined;
  #bytes = 0;
  #failed = false;
  constructor(private readonly expected: ExpectedBootstrapAcknowledgment) { this.expected = { ...expected }; }
  push(chunk: Uint8Array): void {
    if (this.#failed) throw failure();
    try {
      if (chunk.length === 0) return;
      this.#bytes += chunk.length;
      if (this.#ack || this.#bytes > 4096) throw failure();
      this.#buffer = Buffer.concat([this.#buffer, chunk]);
      const newline = this.#buffer.indexOf(10);
      if (newline < 0) return;
      if (newline !== this.#buffer.length - 1) throw failure();
      const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(this.#buffer.subarray(0, newline));
      const ack = parseAcknowledgment(text);
      if (Object.keys(ack).sort().join(',') !== 'digest,id,nonce,type,v' || ack.v !== 1 || ack.type !== 'DELIVERED' ||
          ack.id !== this.expected.id || ack.nonce !== this.expected.nonce || ack.digest !== this.expected.digest) throw failure();
      this.#ack = ack as unknown as BootstrapAcknowledgment;
      this.#buffer = Buffer.alloc(0);
    } catch { this.#failed = true; throw failure(); }
  }
  finish(): BootstrapAcknowledgment {
    if (this.#failed || !this.#ack) { this.#failed = true; throw failure(); }
    return { ...this.#ack };
  }
}

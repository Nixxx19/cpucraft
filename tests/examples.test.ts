// end-to-end: assemble + run the bundled example programs and assert their
// real output. these are the same programs shipped in the ui dropdown.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runSource } from './helpers';

const here = dirname(fileURLToPath(import.meta.url));
const ex = (name: string) => readFileSync(join(here, '..', 'examples', name), 'utf8');

describe('example programs', () => {
  it('hello.asm prints "HELLO WORLD"', () => {
    const cpu = runSource(ex('hello.asm'));
    const text = String.fromCharCode(...cpu.outputBuffer);
    expect(text).toBe('HELLO WORLD');
  });

  it('fibonacci.asm outputs and stores the first 10 numbers', () => {
    const cpu = runSource(ex('fibonacci.asm'));
    const expected = [0, 1, 1, 2, 3, 5, 8, 13, 21, 34];
    expect(cpu.outputBuffer).toEqual(expected);
    // also stored at 0x0100..0x0109
    const stored = Array.from(cpu.memory.slice(0x0100, 0x010A));
    expect(stored).toEqual(expected);
  });

  it('sort.asm bubble-sorts the array ascending', () => {
    const cpu = runSource(ex('sort.asm'));
    expect(cpu.outputBuffer).toEqual([5, 17, 28, 42, 93]);
    const inMem = Array.from(cpu.memory.slice(0x0200, 0x0205));
    expect(inMem).toEqual([5, 17, 28, 42, 93]);
  });

  it('input-sum.asm sums the input queue', () => {
    const cpu = runSource(ex('input-sum.asm'), [10, 20, 30, 40, 50]);
    expect(cpu.outputBuffer).toEqual([150]);
  });
});

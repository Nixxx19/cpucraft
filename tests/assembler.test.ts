// unit tests for the two-pass assembler.
import { describe, it, expect } from 'vitest';
import { assemble } from '../src/assembler';
import { Opcode, Mode, decodeInstruction } from '../src/cpu';

describe('assembler', () => {
  it('resolves forward label references', () => {
    const r = assemble('JMP end\nNOP\nend:\nHLT');
    expect(r.success).toBe(true);
    expect(r.symbolTable.get('end')).toBe(3); // jmp(2 words) + nop(1) = addr 3
  });

  it('encodes immediates in a second word', () => {
    const r = assemble('MOV R1, 0x1234\nHLT');
    expect(r.success).toBe(true);
    const first = decodeInstruction(r.machineCode[0]);
    expect(first.opcode).toBe(Opcode.MOV);
    expect(first.mode).toBe(Mode.REG_IMM);
    expect(first.regA).toBe(1);
    expect(r.machineCode[1]).toBe(0x1234);
  });

  it('parses hex, binary, decimal and char immediates', () => {
    const r = assemble("MOV R0, 0b1010\nMOV R1, 'A'\nMOV R2, 255\nHLT");
    expect(r.success).toBe(true);
    expect(r.machineCode[1]).toBe(0b1010);
    expect(r.machineCode[3]).toBe(65);
    expect(r.machineCode[5]).toBe(255);
  });

  it('reports an error on an undefined label', () => {
    const r = assemble('JMP nowhere\nHLT');
    expect(r.success).toBe(false);
    expect(r.errors[0].message).toMatch(/undefined label/i);
  });

  it('reports an error on an unknown mnemonic', () => {
    const r = assemble('FOObar R0\nHLT');
    expect(r.success).toBe(false);
    expect(r.errors[0].message).toMatch(/unknown instruction/i);
  });

  it('assembles SWAP as a single-word register-register instruction', () => {
    const r = assemble('SWAP R0, R1\nHLT');
    expect(r.success).toBe(true);
    const d = decodeInstruction(r.machineCode[0]);
    expect(d.opcode).toBe(Opcode.SWAP);
    expect(d.mode).toBe(Mode.REG_REG);
    expect(d.regA).toBe(0);
    expect(d.regB).toBe(1);
    // single word: next word is the hlt, not an immediate
    expect(r.machineCode).toHaveLength(2);
    expect(decodeInstruction(r.machineCode[1]).opcode).toBe(Opcode.HLT);
  });

  it('rejects SWAP with a non-register operand', () => {
    const r = assemble('SWAP R0, 5\nHLT');
    expect(r.success).toBe(false);
  });
});

// unit tests for the cpu core: opcode semantics and flag behaviour.
import { describe, it, expect } from 'vitest';
import { Flag } from '../src/cpu';
import { runSource } from './helpers';

describe('arithmetic & flags', () => {
  it('ADD sets ZERO when result is 0', () => {
    const cpu = runSource('MOV R0, 5\nSUB R0, 5\nHLT');
    expect(cpu.registers[0]).toBe(0);
    expect(cpu.flags & Flag.ZERO).toBeTruthy();
  });

  it('ADD sets CARRY on 16-bit overflow', () => {
    const cpu = runSource('MOV R0, 0xFFFF\nADD R0, 1\nHLT');
    expect(cpu.registers[0]).toBe(0);
    expect(cpu.flags & Flag.CARRY).toBeTruthy();
  });

  it('SUB sets NEGATIVE when result is negative (two’s complement)', () => {
    const cpu = runSource('MOV R0, 1\nSUB R0, 3\nHLT');
    expect(cpu.registers[0]).toBe(0xFFFE); // -2
    expect(cpu.flags & Flag.NEGATIVE).toBeTruthy();
  });

  it('DIV halts on divide-by-zero', () => {
    const cpu = runSource('MOV R0, 10\nDIV R0, 0\nHLT');
    expect(cpu.halted).toBe(true);
  });
});

describe('new opcodes', () => {
  it('MOD computes remainder', () => {
    const cpu = runSource('MOV R0, 17\nMOD R0, 5\nHLT');
    expect(cpu.registers[0]).toBe(2);
  });

  it('MOD halts on modulo-by-zero', () => {
    const cpu = runSource('MOV R0, 17\nMOD R0, 0\nHLT');
    expect(cpu.halted).toBe(true);
  });

  it('NEG two’s-complement negates', () => {
    const cpu = runSource('MOV R0, 5\nNEG R0\nHLT');
    expect(cpu.registers[0]).toBe(0xFFFB); // -5
    expect(cpu.flags & Flag.NEGATIVE).toBeTruthy();
  });

  it('SWAP exchanges two registers', () => {
    const cpu = runSource('MOV R0, 11\nMOV R1, 22\nSWAP R0, R1\nHLT');
    expect(cpu.registers[0]).toBe(22);
    expect(cpu.registers[1]).toBe(11);
  });

  it('TEST sets ZERO without modifying the register', () => {
    const cpu = runSource('MOV R0, 0x00F0\nTEST R0, 0x000F\nHLT');
    expect(cpu.registers[0]).toBe(0x00F0); // unchanged
    expect(cpu.flags & Flag.ZERO).toBeTruthy(); // 0xf0 & 0x0f == 0
  });
});

describe('memory & stack', () => {
  it('STORE then LOAD round-trips through memory', () => {
    const cpu = runSource('MOV R0, 1234\nSTORE 0x0300, R0\nLOAD R1, [0x0300]\nHLT');
    expect(cpu.registers[1]).toBe(1234);
  });

  it('PUSH/POP is LIFO', () => {
    const cpu = runSource('MOV R0, 7\nMOV R1, 9\nPUSH R0\nPUSH R1\nPOP R2\nPOP R3\nHLT');
    expect(cpu.registers[2]).toBe(9);
    expect(cpu.registers[3]).toBe(7);
  });
});

describe('input queue (IN)', () => {
  it('IN consumes the queue in order, then returns 0 when exhausted', () => {
    // third read is past the end of the 2-value queue
    const cpu = runSource('IN R0\nIN R1\nIN R2\nHLT', [100, 200]);
    expect(cpu.registers[0]).toBe(100);
    expect(cpu.registers[1]).toBe(200);
    expect(cpu.registers[2]).toBe(0);
  });
});

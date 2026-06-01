// unit tests for the debugger: breakpoints and call-aware step-over.
import { describe, it, expect } from 'vitest';
import { createDebugger, debugStep, debugStepOver, toggleBreakpoint } from '../src/debugger';
import { loadProgram } from './helpers';

describe('debugger', () => {
  it('debugStep advances one instruction at a time', () => {
    const cpu = loadProgram('MOV R0, 1\nMOV R1, 2\nHLT');
    const dbg = createDebugger();
    debugStep(cpu, dbg);
    expect(cpu.registers[0]).toBe(1);
    expect(cpu.registers[1]).toBe(0); // not yet executed
    debugStep(cpu, dbg);
    expect(cpu.registers[1]).toBe(2);
  });

  it('toggleBreakpoint adds and removes', () => {
    const dbg = createDebugger();
    expect(toggleBreakpoint(dbg, 4)).toBe(true);
    expect(dbg.breakpoints.has(4)).toBe(true);
    expect(toggleBreakpoint(dbg, 4)).toBe(false);
    expect(dbg.breakpoints.has(4)).toBe(false);
  });

  it('step-over runs an entire subroutine as one step', () => {
    // main calls a subroutine that sets r1=42, then sets r0=1 after returning
    const src = [
      '  CALL sub',   // step over this whole call
      '  MOV R0, 1',
      '  HLT',
      'sub:',
      '  MOV R1, 42',
      '  RET',
    ].join('\n');
    const cpu = loadProgram(src);
    const dbg = createDebugger();
    debugStepOver(cpu, dbg);          // execute call..ret in one go
    expect(cpu.registers[1]).toBe(42); // subroutine ran
    expect(cpu.registers[0]).toBe(0);  // but we stopped before mov r0,1
    expect(cpu.halted).toBe(false);
    debugStepOver(cpu, dbg);           // now mov r0, 1
    expect(cpu.registers[0]).toBe(1);
  });
});

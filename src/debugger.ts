// ============================================================
// cpucraft - debugger
// ============================================================

import { CPUState, step, resetCPU, Opcode, decodeInstruction } from './cpu';

export interface DebuggerState {
  breakpoints: Set<number>;
  watchpoints: Set<number>;    // memory addresses to watch
  running: boolean;
  speed: number;               // ms between steps in run mode
  maxSteps: number;            // safety limit per run
  timerId: number | null;
  onStep: ((instrAddr: number) => void) | null;
  onHalt: (() => void) | null;
  onBreakpoint: ((addr: number) => void) | null;
  onWatchpoint: ((addr: number, oldVal: number, newVal: number) => void) | null;
}

export function createDebugger(): DebuggerState {
  return {
    breakpoints: new Set(),
    watchpoints: new Set(),
    running: false,
    speed: 50,
    maxSteps: 1_000_000,
    timerId: null,
    onStep: null,
    onHalt: null,
    onBreakpoint: null,
    onWatchpoint: null,
  };
}

export function toggleBreakpoint(dbg: DebuggerState, addr: number): boolean {
  if (dbg.breakpoints.has(addr)) {
    dbg.breakpoints.delete(addr);
    return false;
  } else {
    dbg.breakpoints.add(addr);
    return true;
  }
}

export function toggleWatchpoint(dbg: DebuggerState, addr: number): boolean {
  if (dbg.watchpoints.has(addr)) {
    dbg.watchpoints.delete(addr);
    return false;
  } else {
    dbg.watchpoints.add(addr);
    return true;
  }
}

export function debugStep(cpu: CPUState, dbg: DebuggerState): boolean {
  // snapshot watched memory
  const watchSnapshots = new Map<number, number>();
  for (const addr of dbg.watchpoints) {
    watchSnapshots.set(addr, cpu.memory[addr]);
  }

  const result = step(cpu);
  if (!result.executed) return false;

  // check watchpoints
  for (const [addr, oldVal] of watchSnapshots) {
    const newVal = cpu.memory[addr];
    if (newVal !== oldVal && dbg.onWatchpoint) {
      dbg.onWatchpoint(addr, oldVal, newVal);
    }
  }

  if (dbg.onStep) dbg.onStep(result.instrAddr);

  if (cpu.halted) {
    dbg.running = false;
    if (dbg.onHalt) dbg.onHalt();
    return false;
  }

  return true;
}

// step over a call: run the whole subroutine as one step
export function debugStepOver(cpu: CPUState, dbg: DebuggerState): boolean {
  if (cpu.halted) return false;

  const { opcode } = decodeInstruction(cpu.memory[cpu.pc]);
  if (opcode !== Opcode.CALL) {
    return debugStep(cpu, dbg);
  }

  // sp before the call; ret brings it back here
  const targetSp = cpu.sp;
  let ok = debugStep(cpu, dbg);            // the call itself
  let steps = 0;
  while (ok && !cpu.halted && cpu.sp < targetSp && steps < dbg.maxSteps) {
    ok = debugStep(cpu, dbg);
    steps++;
  }
  return ok && !cpu.halted;
}

export function debugRun(cpu: CPUState, dbg: DebuggerState): void {
  if (dbg.running) return;
  dbg.running = true;

  const tick = () => {
    if (!dbg.running) return;

    // execute a batch of steps for performance at high speeds
    const batchSize = dbg.speed <= 10 ? 100 : dbg.speed <= 50 ? 10 : 1;

    for (let i = 0; i < batchSize; i++) {
      if (!dbg.running) return;

      const ok = debugStep(cpu, dbg);
      if (!ok) {
        dbg.running = false;
        return;
      }

      // check breakpoint at next instruction
      if (dbg.breakpoints.has(cpu.pc)) {
        dbg.running = false;
        if (dbg.onBreakpoint) dbg.onBreakpoint(cpu.pc);
        return;
      }
    }

    dbg.timerId = window.setTimeout(tick, dbg.speed) as unknown as number;
  };

  tick();
}

export function debugStop(dbg: DebuggerState): void {
  dbg.running = false;
  if (dbg.timerId !== null) {
    clearTimeout(dbg.timerId);
    dbg.timerId = null;
  }
}

export function debugReset(cpu: CPUState, dbg: DebuggerState): void {
  debugStop(dbg);
  resetCPU(cpu);
}

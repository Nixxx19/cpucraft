// shared test helpers: assemble a program, load it, and run to completion.
import { createCPU, resetCPU, step, CPUState } from '../src/cpu';
import { assemble } from '../src/assembler';

export function loadProgram(source: string, input: number[] = []): CPUState {
  const result = assemble(source);
  if (!result.success) {
    throw new Error('assembly failed: ' + result.errors.map(e => `L${e.line}: ${e.message}`).join('; '));
  }
  const cpu = createCPU();
  resetCPU(cpu);
  for (let i = 0; i < result.machineCode.length; i++) cpu.memory[i] = result.machineCode[i];
  cpu.inputBuffer = input.slice();
  cpu.inputPos = 0;
  return cpu;
}

export function run(cpu: CPUState, maxSteps = 1_000_000): CPUState {
  let n = 0;
  while (!cpu.halted && n < maxSteps) {
    step(cpu);
    n++;
  }
  if (!cpu.halted) throw new Error(`program did not halt within ${maxSteps} steps`);
  return cpu;
}

export function runSource(source: string, input: number[] = []): CPUState {
  return run(loadProgram(source, input));
}

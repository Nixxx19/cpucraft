// ============================================================
// cpucraft - 16-bit CPU Core
// ============================================================

// --- Opcodes ------------------------------------------------
export const Opcode = {
  HLT:   0x00,
  MOV:   0x01,  // MOV Rd, Rs/imm
  ADD:   0x02,
  SUB:   0x03,
  MUL:   0x04,
  DIV:   0x05,
  AND:   0x06,
  OR:    0x07,
  XOR:   0x08,
  NOT:   0x09,
  SHL:   0x0A,
  SHR:   0x0B,
  CMP:   0x0C,
  JMP:   0x0D,
  JEQ:   0x0E,
  JNE:   0x0F,
  JGT:   0x10,
  JLT:   0x11,
  PUSH:  0x12,
  POP:   0x13,
  CALL:  0x14,
  RET:   0x15,
  LOAD:  0x16,  // LOAD Rd, [addr/Rs]
  STORE: 0x17,  // STORE [addr/Rs], Rs
  IN:    0x18,
  OUT:   0x19,
  NOP:   0x1A,
  JGE:   0x1B,
  JLE:   0x1C,
  INC:   0x1D,
  DEC:   0x1E,
} as const;

export type OpcodeValue = (typeof Opcode)[keyof typeof Opcode];

export const OPCODE_NAMES: Record<number, string> = {};
for (const [name, val] of Object.entries(Opcode)) {
  OPCODE_NAMES[val] = name;
}

// --- Flags --------------------------------------------------
export const Flag = {
  ZERO:     0b0001,
  CARRY:    0b0010,
  NEGATIVE: 0b0100,
  OVERFLOW: 0b1000,
} as const;

// --- Instruction encoding -----------------------------------
// Each instruction is 1-3 words (16-bit each):
//   Word 0:  [opcode:8][mode:2][regA:3][regB:3]
//   Word 1:  immediate / address (optional)
//
// mode: 0 = reg,reg   1 = reg,imm   2 = reg,[addr]  3 = [addr],reg

export const Mode = {
  REG_REG: 0,
  REG_IMM: 1,
  REG_ADDR: 2,
  ADDR_REG: 3,
} as const;

export function encodeInstruction(opcode: number, mode: number, regA: number, regB: number): number {
  return ((opcode & 0xFF) << 8) | ((mode & 0x3) << 6) | ((regA & 0x7) << 3) | (regB & 0x7);
}

export function decodeInstruction(word: number) {
  return {
    opcode: (word >> 8) & 0xFF,
    mode:   (word >> 6) & 0x3,
    regA:   (word >> 3) & 0x7,
    regB:   word & 0x7,
  };
}

// --- CPU State ----------------------------------------------
export interface CPUState {
  registers: Uint16Array;   // R0-R7 = index 0-7
  pc: number;
  sp: number;
  flags: number;
  memory: Uint16Array;
  halted: boolean;
  outputBuffer: number[];
  cycleCount: number;
}

export const REG_COUNT = 8;
export const MEM_SIZE = 0x10000; // 64K words (128KB)
export const STACK_START = 0xFFFE;

export function createCPU(): CPUState {
  return {
    registers: new Uint16Array(REG_COUNT),
    pc: 0,
    sp: STACK_START,
    flags: 0,
    memory: new Uint16Array(MEM_SIZE),
    halted: false,
    outputBuffer: [],
    cycleCount: 0,
  };
}

export function resetCPU(cpu: CPUState): void {
  cpu.registers.fill(0);
  cpu.pc = 0;
  cpu.sp = STACK_START;
  cpu.flags = 0;
  cpu.memory.fill(0);
  cpu.halted = false;
  cpu.outputBuffer = [];
  cpu.cycleCount = 0;
}

// --- Helpers ------------------------------------------------
function setFlag(cpu: CPUState, flag: number, val: boolean): void {
  if (val) cpu.flags |= flag;
  else cpu.flags &= ~flag;
}

function getFlag(cpu: CPUState, flag: number): boolean {
  return (cpu.flags & flag) !== 0;
}

function updateFlags(cpu: CPUState, result: number, a: number, b: number, isSub: boolean): void {
  const r16 = result & 0xFFFF;
  setFlag(cpu, Flag.ZERO, r16 === 0);
  setFlag(cpu, Flag.NEGATIVE, (r16 & 0x8000) !== 0);
  if (isSub) {
    setFlag(cpu, Flag.CARRY, a < b);  // borrow
    const sa = toSigned(a), sb = toSigned(b), sr = toSigned(r16);
    setFlag(cpu, Flag.OVERFLOW, (sa > 0 && sb < 0 && sr < 0) || (sa < 0 && sb > 0 && sr > 0));
  } else {
    setFlag(cpu, Flag.CARRY, result > 0xFFFF);
    const sa = toSigned(a), sb = toSigned(b), sr = toSigned(r16);
    setFlag(cpu, Flag.OVERFLOW, (sa > 0 && sb > 0 && sr < 0) || (sa < 0 && sb < 0 && sr > 0));
  }
}

function toSigned(v: number): number {
  return v >= 0x8000 ? v - 0x10000 : v;
}

function readWord(cpu: CPUState): number {
  const val = cpu.memory[cpu.pc] ?? 0;
  cpu.pc = (cpu.pc + 1) & 0xFFFF;
  return val;
}

function pushWord(cpu: CPUState, val: number): void {
  cpu.memory[cpu.sp] = val & 0xFFFF;
  cpu.sp = (cpu.sp - 1) & 0xFFFF;
}

function popWord(cpu: CPUState): number {
  cpu.sp = (cpu.sp + 1) & 0xFFFF;
  return cpu.memory[cpu.sp];
}

// --- Fetch-Decode-Execute -----------------------------------
export function step(cpu: CPUState): { executed: boolean; instrAddr: number } {
  if (cpu.halted) return { executed: false, instrAddr: cpu.pc };

  const instrAddr = cpu.pc;
  const word = readWord(cpu);
  const { opcode, mode, regA, regB } = decodeInstruction(word);

  // Read immediate if mode requires it
  let imm = 0;
  const needsImm = mode === Mode.REG_IMM || mode === Mode.REG_ADDR || mode === Mode.ADDR_REG;
  if (needsImm && opcode !== Opcode.HLT && opcode !== Opcode.RET && opcode !== Opcode.NOP) {
    imm = readWord(cpu);
  }

  // Resolve operand B value
  const bVal = (): number => {
    switch (mode) {
      case Mode.REG_REG:  return cpu.registers[regB];
      case Mode.REG_IMM:  return imm;
      case Mode.REG_ADDR: return imm;
      case Mode.ADDR_REG: return cpu.registers[regB];
      default: return 0;
    }
  };

  switch (opcode) {
    case Opcode.HLT:
      cpu.halted = true;
      break;

    case Opcode.NOP:
      break;

    case Opcode.MOV:
      cpu.registers[regA] = bVal() & 0xFFFF;
      break;

    case Opcode.ADD: {
      const a = cpu.registers[regA], b = bVal();
      const result = a + b;
      cpu.registers[regA] = result & 0xFFFF;
      updateFlags(cpu, result, a, b, false);
      break;
    }

    case Opcode.SUB: {
      const a = cpu.registers[regA], b = bVal();
      const result = a - b;
      cpu.registers[regA] = result & 0xFFFF;
      updateFlags(cpu, result & 0xFFFF, a, b, true);
      break;
    }

    case Opcode.MUL: {
      const a = cpu.registers[regA], b = bVal();
      const result = a * b;
      cpu.registers[regA] = result & 0xFFFF;
      setFlag(cpu, Flag.ZERO, (result & 0xFFFF) === 0);
      setFlag(cpu, Flag.CARRY, result > 0xFFFF);
      setFlag(cpu, Flag.NEGATIVE, ((result & 0xFFFF) & 0x8000) !== 0);
      break;
    }

    case Opcode.DIV: {
      const a = cpu.registers[regA], b = bVal();
      if (b === 0) {
        cpu.halted = true; // division by zero halts
        break;
      }
      cpu.registers[regA] = (Math.floor(a / b)) & 0xFFFF;
      setFlag(cpu, Flag.ZERO, cpu.registers[regA] === 0);
      setFlag(cpu, Flag.NEGATIVE, false);
      break;
    }

    case Opcode.AND: {
      const result = cpu.registers[regA] & bVal();
      cpu.registers[regA] = result;
      setFlag(cpu, Flag.ZERO, result === 0);
      setFlag(cpu, Flag.NEGATIVE, (result & 0x8000) !== 0);
      break;
    }

    case Opcode.OR: {
      const result = cpu.registers[regA] | bVal();
      cpu.registers[regA] = result;
      setFlag(cpu, Flag.ZERO, result === 0);
      setFlag(cpu, Flag.NEGATIVE, (result & 0x8000) !== 0);
      break;
    }

    case Opcode.XOR: {
      const result = cpu.registers[regA] ^ bVal();
      cpu.registers[regA] = result;
      setFlag(cpu, Flag.ZERO, result === 0);
      setFlag(cpu, Flag.NEGATIVE, (result & 0x8000) !== 0);
      break;
    }

    case Opcode.NOT: {
      const result = (~cpu.registers[regA]) & 0xFFFF;
      cpu.registers[regA] = result;
      setFlag(cpu, Flag.ZERO, result === 0);
      setFlag(cpu, Flag.NEGATIVE, (result & 0x8000) !== 0);
      break;
    }

    case Opcode.SHL: {
      const a = cpu.registers[regA], b = bVal();
      const result = (a << b);
      setFlag(cpu, Flag.CARRY, (result & 0x10000) !== 0);
      cpu.registers[regA] = result & 0xFFFF;
      setFlag(cpu, Flag.ZERO, cpu.registers[regA] === 0);
      setFlag(cpu, Flag.NEGATIVE, (cpu.registers[regA] & 0x8000) !== 0);
      break;
    }

    case Opcode.SHR: {
      const a = cpu.registers[regA], b = bVal();
      setFlag(cpu, Flag.CARRY, b > 0 && ((a >> (b - 1)) & 1) !== 0);
      cpu.registers[regA] = (a >>> b) & 0xFFFF;
      setFlag(cpu, Flag.ZERO, cpu.registers[regA] === 0);
      setFlag(cpu, Flag.NEGATIVE, false);
      break;
    }

    case Opcode.CMP: {
      const a = cpu.registers[regA], b = bVal();
      const result = a - b;
      updateFlags(cpu, result & 0xFFFF, a, b, true);
      break;
    }

    case Opcode.JMP: {
      cpu.pc = mode === Mode.REG_REG ? cpu.registers[regA] : imm;
      break;
    }

    case Opcode.JEQ: {
      const addr = mode === Mode.REG_REG ? cpu.registers[regA] : imm;
      if (getFlag(cpu, Flag.ZERO)) cpu.pc = addr;
      break;
    }

    case Opcode.JNE: {
      const addr = mode === Mode.REG_REG ? cpu.registers[regA] : imm;
      if (!getFlag(cpu, Flag.ZERO)) cpu.pc = addr;
      break;
    }

    case Opcode.JGT: {
      const addr = mode === Mode.REG_REG ? cpu.registers[regA] : imm;
      if (!getFlag(cpu, Flag.ZERO) && !getFlag(cpu, Flag.NEGATIVE)) cpu.pc = addr;
      break;
    }

    case Opcode.JLT: {
      const addr = mode === Mode.REG_REG ? cpu.registers[regA] : imm;
      if (getFlag(cpu, Flag.NEGATIVE)) cpu.pc = addr;
      break;
    }

    case Opcode.JGE: {
      const addr = mode === Mode.REG_REG ? cpu.registers[regA] : imm;
      if (!getFlag(cpu, Flag.NEGATIVE) || getFlag(cpu, Flag.ZERO)) cpu.pc = addr;
      break;
    }

    case Opcode.JLE: {
      const addr = mode === Mode.REG_REG ? cpu.registers[regA] : imm;
      if (getFlag(cpu, Flag.NEGATIVE) || getFlag(cpu, Flag.ZERO)) cpu.pc = addr;
      break;
    }

    case Opcode.PUSH: {
      pushWord(cpu, cpu.registers[regA]);
      break;
    }

    case Opcode.POP: {
      cpu.registers[regA] = popWord(cpu);
      break;
    }

    case Opcode.CALL: {
      const addr = mode === Mode.REG_IMM ? imm : cpu.registers[regA];
      pushWord(cpu, cpu.pc);
      cpu.pc = addr;
      break;
    }

    case Opcode.RET: {
      cpu.pc = popWord(cpu);
      break;
    }

    case Opcode.LOAD: {
      // LOAD Rd, [addr] or LOAD Rd, [Rs]
      if (mode === Mode.REG_ADDR || mode === Mode.REG_IMM) {
        cpu.registers[regA] = cpu.memory[imm & 0xFFFF];
      } else {
        // REG_REG: load from address in regB
        cpu.registers[regA] = cpu.memory[cpu.registers[regB]];
      }
      break;
    }

    case Opcode.STORE: {
      // STORE [addr], Rs  or  STORE [Rd], Rs
      if (mode === Mode.ADDR_REG || mode === Mode.REG_IMM) {
        cpu.memory[imm & 0xFFFF] = cpu.registers[regB];
      } else {
        // REG_REG: store at address in regA
        cpu.memory[cpu.registers[regA]] = cpu.registers[regB];
      }
      break;
    }

    case Opcode.IN: {
      // IN Rd - read from input (stubbed to 0 for now)
      cpu.registers[regA] = 0;
      break;
    }

    case Opcode.OUT: {
      // OUT Rs - write register value to output buffer
      cpu.outputBuffer.push(cpu.registers[regA]);
      break;
    }

    case Opcode.INC: {
      const a = cpu.registers[regA];
      const result = a + 1;
      cpu.registers[regA] = result & 0xFFFF;
      updateFlags(cpu, result, a, 1, false);
      break;
    }

    case Opcode.DEC: {
      const a = cpu.registers[regA];
      const result = a - 1;
      cpu.registers[regA] = result & 0xFFFF;
      updateFlags(cpu, result & 0xFFFF, a, 1, true);
      break;
    }

    default:
      // Unknown opcode - treat as NOP
      break;
  }

  cpu.cycleCount++;
  return { executed: true, instrAddr };
}

// Determine instruction size (1 or 2 words) for a given first word
export function instructionSize(word: number): number {
  const { opcode, mode } = decodeInstruction(word);
  if (opcode === Opcode.HLT || opcode === Opcode.RET || opcode === Opcode.NOP) return 1;
  if (opcode === Opcode.NOT || opcode === Opcode.INC || opcode === Opcode.DEC) return 1;
  if (opcode === Opcode.PUSH || opcode === Opcode.POP) return 1;
  if (opcode === Opcode.OUT || opcode === Opcode.IN) return 1;
  if (mode === Mode.REG_REG) return 1;
  return 2; // has immediate
}

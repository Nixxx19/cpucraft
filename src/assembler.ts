// ============================================================
// cpucraft - Assembler: text -> machine code
// ============================================================

import { Opcode, Mode, encodeInstruction } from './cpu';

export interface AssemblerError {
  line: number;
  message: string;
}

export interface AssemblerResult {
  success: boolean;
  machineCode: number[];
  errors: AssemblerError[];
  symbolTable: Map<string, number>;
  // Map from memory address -> source line number (0-based)
  addressToLine: Map<number, number>;
}

// Register name -> index
const REG_MAP: Record<string, number> = {
  R0: 0, R1: 1, R2: 2, R3: 3, R4: 4, R5: 5, R6: 6, R7: 7,
};

function isRegister(token: string): boolean {
  return token.toUpperCase() in REG_MAP;
}

function regIndex(token: string): number {
  return REG_MAP[token.toUpperCase()];
}

function parseImmediate(token: string): number | null {
  let s = token;
  // Handle character literals like 'A'
  if (s.length === 3 && s.startsWith("'") && s.endsWith("'")) {
    return s.charCodeAt(1);
  }
  const negative = s.startsWith('-');
  if (negative) s = s.slice(1);
  let val: number;
  if (s.startsWith('0x') || s.startsWith('0X')) {
    val = parseInt(s, 16);
  } else if (s.startsWith('0b') || s.startsWith('0B')) {
    val = parseInt(s.slice(2), 2);
  } else {
    val = parseInt(s, 10);
  }
  if (isNaN(val)) return null;
  if (negative) val = -val;
  return val & 0xFFFF;
}

// Instructions that take no operands
const NO_OPERAND = new Set(['HLT', 'RET', 'NOP']);
// Instructions that take 1 register
const ONE_REG = new Set(['PUSH', 'POP', 'OUT', 'IN', 'NOT', 'INC', 'DEC']);
// Jump instructions (take label or immediate)
const JUMP_OPS = new Set(['JMP', 'JEQ', 'JNE', 'JGT', 'JLT', 'JGE', 'JLE', 'CALL']);
// ALU / two-operand: Rd, Rs/imm
const TWO_OPERAND = new Set(['MOV', 'ADD', 'SUB', 'MUL', 'DIV', 'AND', 'OR', 'XOR', 'SHL', 'SHR', 'CMP']);

export function assemble(source: string): AssemblerResult {
  const lines = source.split('\n');
  const errors: AssemblerError[] = [];
  const symbolTable = new Map<string, number>();
  const addressToLine = new Map<number, number>();

  // Intermediate representation
  interface InstrEntry {
    line: number;
    opcode: number;
    mode: number;
    regA: number;
    regB: number;
    imm: number | null;        // resolved immediate
    labelRef: string | null;   // unresolved label
    isData: boolean;
    dataValue: number;
  }

  const entries: InstrEntry[] = [];
  let addr = 0;

  // ---------- Pass 1: parse lines, collect labels ----------
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const lineNum = i + 1;

    // Strip comments
    const commentIdx = line.indexOf(';');
    if (commentIdx !== -1) line = line.slice(0, commentIdx);
    line = line.trim();
    if (line === '') continue;

    // Check for label
    if (line.endsWith(':')) {
      const label = line.slice(0, -1).trim();
      if (symbolTable.has(label)) {
        errors.push({ line: lineNum, message: `Duplicate label "${label}"` });
      } else {
        symbolTable.set(label, addr);
      }
      continue;
    }

    // Handle label on same line as instruction: "label: INSTR ..."
    let labelOnLine: string | null = null;
    const colonIdx = line.indexOf(':');
    if (colonIdx !== -1 && !line.startsWith('.')) {
      labelOnLine = line.slice(0, colonIdx).trim();
      line = line.slice(colonIdx + 1).trim();
      if (symbolTable.has(labelOnLine)) {
        errors.push({ line: lineNum, message: `Duplicate label "${labelOnLine}"` });
      } else {
        symbolTable.set(labelOnLine, addr);
      }
      if (line === '') continue;
    }

    // Data directive: .data VALUE [, VALUE ...]
    if (line.toUpperCase().startsWith('.DATA') || line.toUpperCase().startsWith('.DW')) {
      const rest = line.slice(line.indexOf(' ') + 1);
      const values = rest.split(',').map(v => v.trim());
      for (const v of values) {
        const parsed = parseImmediate(v);
        if (parsed === null) {
          errors.push({ line: lineNum, message: `Invalid data value "${v}"` });
        } else {
          entries.push({
            line: i, opcode: -1, mode: 0, regA: 0, regB: 0,
            imm: null, labelRef: null, isData: true, dataValue: parsed,
          });
          addressToLine.set(addr, i);
          addr++;
        }
      }
      continue;
    }

    // Parse instruction
    // Split by commas and whitespace
    const tokens = line.split(/[\s,]+/).filter(t => t.length > 0);
    const mnemonic = tokens[0].toUpperCase();
    const opcodeVal = (Opcode as Record<string, number>)[mnemonic];

    if (opcodeVal === undefined) {
      errors.push({ line: lineNum, message: `Unknown instruction "${mnemonic}"` });
      continue;
    }

    addressToLine.set(addr, i);

    if (NO_OPERAND.has(mnemonic)) {
      entries.push({
        line: i, opcode: opcodeVal, mode: Mode.REG_REG, regA: 0, regB: 0,
        imm: null, labelRef: null, isData: false, dataValue: 0,
      });
      addr += 1;
    } else if (ONE_REG.has(mnemonic)) {
      if (tokens.length < 2) {
        errors.push({ line: lineNum, message: `${mnemonic} requires a register operand` });
        continue;
      }
      if (!isRegister(tokens[1])) {
        errors.push({ line: lineNum, message: `Expected register, got "${tokens[1]}"` });
        continue;
      }
      entries.push({
        line: i, opcode: opcodeVal, mode: Mode.REG_REG, regA: regIndex(tokens[1]), regB: 0,
        imm: null, labelRef: null, isData: false, dataValue: 0,
      });
      addr += 1;
    } else if (JUMP_OPS.has(mnemonic)) {
      if (tokens.length < 2) {
        errors.push({ line: lineNum, message: `${mnemonic} requires an operand` });
        continue;
      }
      const target = tokens[1];
      if (isRegister(target)) {
        entries.push({
          line: i, opcode: opcodeVal, mode: Mode.REG_REG, regA: regIndex(target), regB: 0,
          imm: null, labelRef: null, isData: false, dataValue: 0,
        });
        addr += 1;
      } else {
        // Could be label or immediate
        const immVal = parseImmediate(target);
        entries.push({
          line: i, opcode: opcodeVal, mode: Mode.REG_IMM, regA: 0, regB: 0,
          imm: immVal, labelRef: immVal === null ? target : null, isData: false, dataValue: 0,
        });
        addr += 2; // instruction word + immediate
      }
    } else if (mnemonic === 'LOAD') {
      // LOAD Rd, [addr] / LOAD Rd, [Rs] / LOAD Rd, addr / LOAD Rd, label
      if (tokens.length < 3) {
        errors.push({ line: lineNum, message: `LOAD requires two operands` });
        continue;
      }
      if (!isRegister(tokens[1])) {
        errors.push({ line: lineNum, message: `Expected register, got "${tokens[1]}"` });
        continue;
      }
      const rd = regIndex(tokens[1]);
      let src = tokens.slice(2).join('');
      // Strip brackets
      src = src.replace(/[\[\]]/g, '').trim();
      if (isRegister(src)) {
        entries.push({
          line: i, opcode: opcodeVal, mode: Mode.REG_REG, regA: rd, regB: regIndex(src),
          imm: null, labelRef: null, isData: false, dataValue: 0,
        });
        addr += 1;
      } else {
        const immVal = parseImmediate(src);
        entries.push({
          line: i, opcode: opcodeVal, mode: Mode.REG_IMM, regA: rd, regB: 0,
          imm: immVal, labelRef: immVal === null ? src : null, isData: false, dataValue: 0,
        });
        addr += 2;
      }
    } else if (mnemonic === 'STORE') {
      // STORE [addr], Rs / STORE [Rd], Rs / STORE addr, Rs
      if (tokens.length < 3) {
        errors.push({ line: lineNum, message: `STORE requires two operands` });
        continue;
      }
      let dst = tokens[1].replace(/[\[\]]/g, '').trim();
      const srcTok = tokens[2].replace(/[\[\]]/g, '').trim();
      if (!isRegister(srcTok)) {
        errors.push({ line: lineNum, message: `STORE source must be a register, got "${srcTok}"` });
        continue;
      }
      const rs = regIndex(srcTok);
      if (isRegister(dst)) {
        // STORE [Rd], Rs
        entries.push({
          line: i, opcode: opcodeVal, mode: Mode.REG_REG, regA: regIndex(dst), regB: rs,
          imm: null, labelRef: null, isData: false, dataValue: 0,
        });
        addr += 1;
      } else {
        const immVal = parseImmediate(dst);
        entries.push({
          line: i, opcode: opcodeVal, mode: Mode.ADDR_REG, regA: 0, regB: rs,
          imm: immVal, labelRef: immVal === null ? dst : null, isData: false, dataValue: 0,
        });
        addr += 2;
      }
    } else if (TWO_OPERAND.has(mnemonic)) {
      if (tokens.length < 3) {
        errors.push({ line: lineNum, message: `${mnemonic} requires two operands` });
        continue;
      }
      if (!isRegister(tokens[1])) {
        errors.push({ line: lineNum, message: `Expected register, got "${tokens[1]}"` });
        continue;
      }
      const rd = regIndex(tokens[1]);
      const src = tokens[2];
      if (isRegister(src)) {
        entries.push({
          line: i, opcode: opcodeVal, mode: Mode.REG_REG, regA: rd, regB: regIndex(src),
          imm: null, labelRef: null, isData: false, dataValue: 0,
        });
        addr += 1;
      } else {
        const immVal = parseImmediate(src);
        entries.push({
          line: i, opcode: opcodeVal, mode: Mode.REG_IMM, regA: rd, regB: 0,
          imm: immVal, labelRef: immVal === null ? src : null, isData: false, dataValue: 0,
        });
        addr += 2;
      }
    } else {
      errors.push({ line: lineNum, message: `Unhandled instruction "${mnemonic}"` });
    }
  }

  // ---------- Pass 2: resolve labels ----------
  for (const entry of entries) {
    if (entry.labelRef !== null) {
      const resolved = symbolTable.get(entry.labelRef);
      if (resolved === undefined) {
        errors.push({ line: entry.line + 1, message: `Undefined label "${entry.labelRef}"` });
      } else {
        entry.imm = resolved;
        entry.labelRef = null;
      }
    }
  }

  if (errors.length > 0) {
    return { success: false, machineCode: [], errors, symbolTable, addressToLine };
  }

  // ---------- Pass 3: emit machine code ----------
  const machineCode: number[] = [];
  for (const entry of entries) {
    if (entry.isData) {
      machineCode.push(entry.dataValue);
    } else {
      machineCode.push(encodeInstruction(entry.opcode, entry.mode, entry.regA, entry.regB));
      if (entry.imm !== null) {
        machineCode.push(entry.imm & 0xFFFF);
      }
    }
  }

  return { success: true, machineCode, errors, symbolTable, addressToLine };
}

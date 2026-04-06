// ============================================================
// cpucraft - UI: DOM manipulation, displays, editor
// ============================================================

import { CPUState, REG_COUNT, Flag, OPCODE_NAMES, decodeInstruction, instructionSize } from './cpu';
import { AssemblerResult } from './assembler';
import { DebuggerState } from './debugger';

// ---- Helpers ------------------------------------------------
function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function hex16(v: number): string {
  return '0x' + (v & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

function hex8(v: number): string {
  return (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

// ---- Register display ---------------------------------------
const prevRegs = new Uint16Array(REG_COUNT);
let prevPC = 0, prevSP = 0, prevFlags = 0;

export function updateRegisters(cpu: CPUState): void {
  const container = $('registers');
  const rows: string[] = [];

  for (let i = 0; i < REG_COUNT; i++) {
    const changed = cpu.registers[i] !== prevRegs[i];
    const cls = changed ? 'reg-changed' : '';
    rows.push(`<div class="reg-row ${cls}"><span class="reg-name">R${i}</span><span class="reg-val">${hex16(cpu.registers[i])}</span><span class="reg-dec">${cpu.registers[i]}</span></div>`);
  }

  const pcChanged = cpu.pc !== prevPC;
  const spChanged = cpu.sp !== prevSP;
  const flChanged = cpu.flags !== prevFlags;

  rows.push(`<div class="reg-row reg-special ${pcChanged ? 'reg-changed' : ''}"><span class="reg-name">PC</span><span class="reg-val">${hex16(cpu.pc)}</span><span class="reg-dec">${cpu.pc}</span></div>`);
  rows.push(`<div class="reg-row reg-special ${spChanged ? 'reg-changed' : ''}"><span class="reg-name">SP</span><span class="reg-val">${hex16(cpu.sp)}</span><span class="reg-dec">${cpu.sp}</span></div>`);

  const z = (cpu.flags & Flag.ZERO) ? 'Z' : '-';
  const c = (cpu.flags & Flag.CARRY) ? 'C' : '-';
  const n = (cpu.flags & Flag.NEGATIVE) ? 'N' : '-';
  const o = (cpu.flags & Flag.OVERFLOW) ? 'O' : '-';
  rows.push(`<div class="reg-row reg-special ${flChanged ? 'reg-changed' : ''}"><span class="reg-name">FL</span><span class="reg-val">${z}${c}${n}${o}</span><span class="reg-dec">${hex16(cpu.flags)}</span></div>`);

  container.innerHTML = rows.join('');

  // Save for next diff
  prevRegs.set(cpu.registers);
  prevPC = cpu.pc;
  prevSP = cpu.sp;
  prevFlags = cpu.flags;
}

// ---- Memory viewer ------------------------------------------
let memViewStart = 0;
const MEM_ROWS = 16;
const MEM_COLS = 8;

export function updateMemory(cpu: CPUState): void {
  const container = $('memory-grid');
  const rows: string[] = [];

  for (let r = 0; r < MEM_ROWS; r++) {
    const baseAddr = memViewStart + r * MEM_COLS;
    let row = `<span class="mem-addr">${hex16(baseAddr)}</span>`;
    for (let c = 0; c < MEM_COLS; c++) {
      const addr = baseAddr + c;
      const val = cpu.memory[addr & 0xFFFF] ?? 0;
      const isPC = addr === cpu.pc;
      const cls = isPC ? 'mem-cell mem-pc' : val !== 0 ? 'mem-cell mem-nonzero' : 'mem-cell';
      row += `<span class="${cls}">${hex16(val)}</span>`;
    }
    rows.push(`<div class="mem-row">${row}</div>`);
  }

  container.innerHTML = rows.join('');
}

export function setMemViewAddr(addr: number): void {
  memViewStart = Math.max(0, Math.min(addr, 0xFFFF - MEM_ROWS * MEM_COLS));
  ($('mem-addr-input') as HTMLInputElement).value = hex16(memViewStart);
}

export function getMemViewStart(): number {
  return memViewStart;
}

export function initMemoryControls(cpu: CPUState): void {
  const input = $('mem-addr-input') as HTMLInputElement;
  input.value = hex16(0);

  input.addEventListener('change', () => {
    const val = parseInt(input.value, 16);
    if (!isNaN(val)) {
      setMemViewAddr(val);
      updateMemory(cpu);
    }
  });

  $('mem-prev').addEventListener('click', () => {
    setMemViewAddr(memViewStart - MEM_ROWS * MEM_COLS);
    updateMemory(cpu);
  });

  $('mem-next').addEventListener('click', () => {
    setMemViewAddr(memViewStart + MEM_ROWS * MEM_COLS);
    updateMemory(cpu);
  });
}

// ---- Output console -----------------------------------------
export function updateOutput(cpu: CPUState): void {
  const container = $('output-content');
  if (cpu.outputBuffer.length === 0) {
    container.textContent = '';
    return;
  }
  // Show as characters (printable) and hex
  const chars = cpu.outputBuffer.map(v => {
    if (v >= 32 && v <= 126) return String.fromCharCode(v);
    return '.';
  }).join('');
  const hexVals = cpu.outputBuffer.map(v => hex16(v)).join(' ');
  container.innerHTML = `<div class="output-chars">${escapeHtml(chars)}</div><div class="output-hex">${hexVals}</div>`;
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---- Code editor with line numbers -------------------------
export function getEditorSource(): string {
  return (($('code-editor') as HTMLTextAreaElement).value);
}

export function setEditorSource(source: string): void {
  ($('code-editor') as HTMLTextAreaElement).value = source;
  updateLineNumbers();
}

export function updateLineNumbers(): void {
  const editor = $('code-editor') as HTMLTextAreaElement;
  const lineCount = editor.value.split('\n').length;
  const nums: string[] = [];
  for (let i = 1; i <= lineCount; i++) {
    nums.push(String(i));
  }
  $('line-numbers').textContent = nums.join('\n');
}

export function highlightLine(lineNum: number): void {
  // Remove previous highlight
  const editor = $('code-editor') as HTMLTextAreaElement;
  const lines = editor.value.split('\n');
  if (lineNum < 0 || lineNum >= lines.length) return;

  // Calculate character position and scroll
  let charPos = 0;
  for (let i = 0; i < lineNum; i++) {
    charPos += lines[i].length + 1;
  }

  // Update highlight indicator
  const lineNums = $('line-numbers');
  const lineEls = lineNums.textContent!.split('\n');
  const highlighted = lineEls.map((n, i) => i === lineNum ? `>${n}` : ` ${n}`);
  lineNums.textContent = highlighted.join('\n');

  // Scroll editor to show current line
  const lineHeight = 20; // approximate
  const scrollTarget = lineNum * lineHeight - editor.clientHeight / 2;
  editor.scrollTop = Math.max(0, scrollTarget);
  lineNums.parentElement!.querySelector('.line-numbers')!.scrollTop = editor.scrollTop;
}

// ---- Assembler error display --------------------------------
export function showErrors(errors: { line: number; message: string }[]): void {
  const container = $('error-output');
  if (errors.length === 0) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';
  container.innerHTML = errors.map(e =>
    `<div class="error-line">Line ${e.line}: ${escapeHtml(e.message)}</div>`
  ).join('');
}

// ---- Disassembly in status ----------------------------------
export function showStatus(msg: string): void {
  $('status-bar').textContent = msg;
}

// ---- Cycle counter ------------------------------------------
export function updateCycles(cpu: CPUState): void {
  $('cycle-count').textContent = `Cycles: ${cpu.cycleCount}`;
}

// ---- Speed display ------------------------------------------
export function updateSpeedDisplay(speed: number): void {
  $('speed-display').textContent = speed <= 10 ? 'MAX' : `${speed}ms`;
}

// ---- Current instruction disassembly ------------------------
export function showCurrentInstruction(cpu: CPUState): void {
  if (cpu.halted) {
    $('current-instr').textContent = '[ HALTED ]';
    return;
  }
  const word = cpu.memory[cpu.pc];
  const { opcode, mode, regA, regB } = decodeInstruction(word);
  const name = OPCODE_NAMES[opcode] || '???';
  $('current-instr').textContent = `Next: ${hex16(cpu.pc)}: ${name} (${hex16(word)})`;
}

// ---- Full UI update -----------------------------------------
export function updateAll(cpu: CPUState): void {
  updateRegisters(cpu);
  updateMemory(cpu);
  updateOutput(cpu);
  updateCycles(cpu);
  showCurrentInstruction(cpu);
}

// ---- Sync line number scroll with editor --------------------
export function initEditorSync(): void {
  const editor = $('code-editor') as HTMLTextAreaElement;
  const lineNums = $('line-numbers');

  editor.addEventListener('scroll', () => {
    lineNums.scrollTop = editor.scrollTop;
  });

  editor.addEventListener('input', () => {
    updateLineNumbers();
  });

  editor.addEventListener('keydown', (e) => {
    // Tab support
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(end);
      editor.selectionStart = editor.selectionEnd = start + 2;
      updateLineNumbers();
    }
  });

  updateLineNumbers();
}

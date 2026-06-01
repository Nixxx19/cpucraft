// ============================================================
// cpucraft - ui: dom manipulation, displays, editor
// ============================================================

import { CPUState, REG_COUNT, Flag, OPCODE_NAMES, decodeInstruction, instructionSize } from './cpu';
import { AssemblerResult } from './assembler';
import { DebuggerState } from './debugger';

// ---- helpers ------------------------------------------------
function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function hex16(v: number): string {
  return '0x' + (v & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

function hex8(v: number): string {
  return (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

// ---- register display ---------------------------------------
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

  // save for next diff
  prevRegs.set(cpu.registers);
  prevPC = cpu.pc;
  prevSP = cpu.sp;
  prevFlags = cpu.flags;
}

// ---- memory viewer ------------------------------------------
let memViewStart = 0;
const MEM_ROWS = 16;
const MEM_COLS = 8;

// breakpoints, shared with debugger so we can highlight them
let breakpointRef: Set<number> | null = null;
export function setBreakpointSet(s: Set<number>): void {
  breakpointRef = s;
}

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
      const isBp = breakpointRef?.has(addr) ?? false;
      let cls = 'mem-cell';
      if (isPC) cls += ' mem-pc';
      else if (val !== 0) cls += ' mem-nonzero';
      if (isBp) cls += ' mem-breakpoint';
      const tip = `${hex16(addr)}${isBp ? ' — breakpoint (click to clear)' : ' — click to set breakpoint'}`;
      row += `<span class="${cls}" data-addr="${addr}" title="${tip}">${hex16(val)}</span>`;
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

export function initMemoryControls(cpu: CPUState, onToggleBreakpoint?: (addr: number) => void): void {
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

  // click a memory cell to toggle a breakpoint at that address.
  $('memory-grid').addEventListener('click', (e) => {
    const cell = (e.target as HTMLElement).closest('.mem-cell') as HTMLElement | null;
    if (!cell || !cell.dataset.addr) return;
    onToggleBreakpoint?.(parseInt(cell.dataset.addr, 10));
    updateMemory(cpu);
  });
}

// ---- input queue --------------------------------------------
export function getInputQueue(): number[] {
  const raw = ($('input-queue') as HTMLInputElement).value.trim();
  if (!raw) return [];
  return raw.split(/[\s,]+/).filter(Boolean).map(t => {
    let n: number;
    if (/^0x/i.test(t)) n = parseInt(t, 16);
    else if (/^0b/i.test(t)) n = parseInt(t.slice(2), 2);
    else n = parseInt(t, 10);
    return (isNaN(n) ? 0 : n) & 0xFFFF;
  });
}

export function setInputQueue(s: string): void {
  ($('input-queue') as HTMLInputElement).value = s;
}

// ---- output console -----------------------------------------
export function updateOutput(cpu: CPUState): void {
  const container = $('output-content');
  if (cpu.outputBuffer.length === 0) {
    container.textContent = '';
    return;
  }
  // decimal (primary), hex, and text rows
  const dec = cpu.outputBuffer.map(v => String(v)).join(' ');
  const hexVals = cpu.outputBuffer.map(v => hex16(v)).join(' ');
  const chars = cpu.outputBuffer.map(v => (v >= 32 && v <= 126) ? String.fromCharCode(v) : '.').join('');
  container.innerHTML =
    `<div class="output-dec">${dec}</div>` +
    `<div class="output-hex">${hexVals}</div>` +
    `<div class="output-chars">text: ${escapeHtml(chars)}</div>`;
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---- code editor with line numbers -------------------------
export function getEditorSource(): string {
  return (($('code-editor') as HTMLTextAreaElement).value);
}

export function setEditorSource(source: string): void {
  ($('code-editor') as HTMLTextAreaElement).value = source;
  gutterCurrentLine = -1;
  renderGutter();
}

// gutter state: the line about to execute, and which lines hold breakpoints.
let gutterCurrentLine = -1;                       // 0-based
let gutterBreakpointLines = new Set<number>();    // 0-based source lines

export function setGutterBreakpointLines(lines: Set<number>): void {
  gutterBreakpointLines = lines;
  renderGutter();
}

// render the line-number gutter with breakpoint dots and a current-line arrow.
// spans are separated by "\n" so the <pre> lays them out one per line.
function renderGutter(): void {
  const editor = $('code-editor') as HTMLTextAreaElement;
  const lineCount = editor.value.split('\n').length;
  const spans: string[] = [];
  for (let i = 0; i < lineCount; i++) {
    const isBp = gutterBreakpointLines.has(i);
    const isCur = i === gutterCurrentLine;
    let cls = 'ln';
    if (isBp) cls += ' ln-bp';
    if (isCur) cls += ' ln-current';
    const marker = isBp ? '●' : isCur ? '▸' : ' ';
    spans.push(`<span class="${cls}" data-line="${i}">${marker}${String(i + 1).padStart(3, ' ')}</span>`);
  }
  $('line-numbers').innerHTML = spans.join('\n');
}

export function updateLineNumbers(): void {
  renderGutter();
}

export function highlightLine(lineNum: number): void {
  const editor = $('code-editor') as HTMLTextAreaElement;
  const lines = editor.value.split('\n');
  if (lineNum < 0 || lineNum >= lines.length) return;

  gutterCurrentLine = lineNum;
  renderGutter();

  // scroll editor (and gutter) to keep the current line in view.
  const lineHeight = 20;
  const scrollTarget = lineNum * lineHeight - editor.clientHeight / 2;
  editor.scrollTop = Math.max(0, scrollTarget);
  $('line-numbers').scrollTop = editor.scrollTop;
}

// ---- assembler error display --------------------------------
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

// ---- disassembly in status ----------------------------------
export function showStatus(msg: string): void {
  $('status-bar').textContent = msg;
}

// ---- cycle counter ------------------------------------------
export function updateCycles(cpu: CPUState): void {
  $('cycle-count').textContent = `Cycles: ${cpu.cycleCount}`;
}

// ---- speed display ------------------------------------------
export function updateSpeedDisplay(speed: number): void {
  $('speed-display').textContent = speed <= 10 ? 'MAX' : `${speed}ms`;
}

// ---- current instruction disassembly ------------------------
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

// ---- full ui update -----------------------------------------
export function updateAll(cpu: CPUState): void {
  updateRegisters(cpu);
  updateMemory(cpu);
  updateOutput(cpu);
  updateCycles(cpu);
  showCurrentInstruction(cpu);
}

// ---- sync line number scroll with editor --------------------
export function initEditorSync(onLineClick?: (line: number) => void): void {
  const editor = $('code-editor') as HTMLTextAreaElement;
  const lineNums = $('line-numbers');

  editor.addEventListener('scroll', () => {
    lineNums.scrollTop = editor.scrollTop;
  });

  editor.addEventListener('input', () => {
    renderGutter();
  });

  editor.addEventListener('keydown', (e) => {
    // tab support
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(end);
      editor.selectionStart = editor.selectionEnd = start + 2;
      renderGutter();
    }
  });

  // click a line number to toggle a breakpoint on that source line.
  lineNums.addEventListener('click', (e) => {
    const span = (e.target as HTMLElement).closest('.ln') as HTMLElement | null;
    if (!span || span.dataset.line === undefined) return;
    onLineClick?.(parseInt(span.dataset.line, 10));
  });

  renderGutter();
}

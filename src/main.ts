// ============================================================
// cpucraft - main: wire everything together
// ============================================================

import { createCPU, resetCPU } from './cpu';
import { assemble } from './assembler';
import { createDebugger, debugStep, debugStepOver, debugRun, debugStop, debugReset, toggleBreakpoint } from './debugger';
import {
  updateAll, getEditorSource, setEditorSource, showErrors, showStatus,
  highlightLine, initEditorSync, initMemoryControls, updateSpeedDisplay,
  updateLineNumbers, setMemViewAddr, updateMemory,
  getInputQueue, setInputQueue, setBreakpointSet, setGutterBreakpointLines,
} from './ui';

// example programs
import helloAsm from '../examples/hello.asm?raw';
import fibAsm from '../examples/fibonacci.asm?raw';
import sortAsm from '../examples/sort.asm?raw';

import inputSumAsm from '../examples/input-sum.asm?raw';

const examples: Record<string, string> = {
  hello: helloAsm,
  fibonacci: fibAsm,
  sort: sortAsm,
  'input-sum': inputSumAsm,
};

// ---- saved programs (localstorage) --------------------------
const SAVE_PREFIX = 'cpucraft:prog:';

function savedNames(): string[] {
  const names: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(SAVE_PREFIX)) names.push(key.slice(SAVE_PREFIX.length));
  }
  return names.sort();
}

function refreshSavedList(): void {
  const select = document.getElementById('saved-select') as HTMLSelectElement;
  const current = select.value;
  select.innerHTML = '<option value="">Saved programs...</option>' +
    savedNames().map(n => `<option value="${n}">${n}</option>`).join('');
  if (savedNames().includes(current)) select.value = current;
}

// ---- state --------------------------------------------------
const cpu = createCPU();
const dbg = createDebugger();
let assemblerResult: ReturnType<typeof assemble> | null = null;

// ---- callbacks ----------------------------------------------
dbg.onStep = (instrAddr: number) => {
  updateAll(cpu);
  // highlight source line
  if (assemblerResult) {
    const line = assemblerResult.addressToLine.get(instrAddr);
    if (line !== undefined) {
      highlightLine(line);
    }
  }
};

dbg.onHalt = () => {
  showStatus('CPU halted');
  updateAll(cpu);
  updateButtonStates();
};

dbg.onBreakpoint = (addr: number) => {
  showStatus(`Breakpoint hit at 0x${addr.toString(16).toUpperCase().padStart(4, '0')}`);
  updateAll(cpu);
  updateButtonStates();
};

dbg.onWatchpoint = (addr, oldVal, newVal) => {
  showStatus(`Watchpoint: [0x${addr.toString(16).toUpperCase().padStart(4, '0')}] changed ${oldVal} -> ${newVal}`);
};

// ---- button state management --------------------------------
function updateButtonStates(): void {
  const assembleBtn = document.getElementById('btn-assemble') as HTMLButtonElement;
  const stepBtn = document.getElementById('btn-step') as HTMLButtonElement;
  const stepOverBtn = document.getElementById('btn-step-over') as HTMLButtonElement;
  const runBtn = document.getElementById('btn-run') as HTMLButtonElement;
  const stopBtn = document.getElementById('btn-stop') as HTMLButtonElement;
  const resetBtn = document.getElementById('btn-reset') as HTMLButtonElement;

  assembleBtn.disabled = dbg.running;
  stepBtn.disabled = dbg.running || cpu.halted;
  stepOverBtn.disabled = dbg.running || cpu.halted;
  runBtn.disabled = dbg.running || cpu.halted;
  stopBtn.disabled = !dbg.running;
  resetBtn.disabled = false;
}

// load the input-queue box contents into the cpu's input buffer.
function applyInput(): void {
  cpu.inputBuffer = getInputQueue();
  cpu.inputPos = 0;
}

// ---- breakpoint <-> source-line mapping ---------------------
// the first memory address emitted for a given source line (its instruction).
function lineToAddr(line: number): number | undefined {
  if (!assemblerResult) return undefined;
  let best: number | undefined;
  for (const [addr, ln] of assemblerResult.addressToLine) {
    if (ln === line && (best === undefined || addr < best)) best = addr;
  }
  return best;
}

// which source lines currently carry a breakpoint (derived from addresses).
function breakpointLines(): Set<number> {
  const lines = new Set<number>();
  if (assemblerResult) {
    for (const addr of dbg.breakpoints) {
      const ln = assemblerResult.addressToLine.get(addr);
      if (ln !== undefined) lines.add(ln);
    }
  }
  return lines;
}

// keep both the gutter and the memory view in sync with the breakpoint set.
function refreshBreakpointViews(): void {
  setGutterBreakpointLines(breakpointLines());
  updateMemory(cpu);
}

// ---- assemble -----------------------------------------------
function doAssemble(): void {
  const source = getEditorSource();
  assemblerResult = assemble(source);

  if (!assemblerResult.success) {
    showErrors(assemblerResult.errors);
    showStatus('Assembly failed');
    return;
  }

  showErrors([]);
  resetCPU(cpu);
  applyInput();

  // load machine code into memory at address 0
  for (let i = 0; i < assemblerResult.machineCode.length; i++) {
    cpu.memory[i] = assemblerResult.machineCode[i];
  }

  showStatus(`Assembled: ${assemblerResult.machineCode.length} words loaded. Symbols: ${[...assemblerResult.symbolTable.entries()].map(([k, v]) => `${k}=0x${v.toString(16)}`).join(', ') || 'none'}`);
  setMemViewAddr(0);
  refreshBreakpointViews();
  updateAll(cpu);
  updateButtonStates();
}

// ---- step ---------------------------------------------------
function doStep(): void {
  if (cpu.halted) return;
  debugStep(cpu, dbg);
  updateAll(cpu);

  if (assemblerResult) {
    const line = assemblerResult.addressToLine.get(cpu.pc);
    if (line !== undefined) {
      highlightLine(line);
    }
  }
  updateButtonStates();
}

// ---- step over (call-aware) ---------------------------------
function doStepOver(): void {
  if (cpu.halted) return;
  debugStepOver(cpu, dbg);
  updateAll(cpu);
  if (assemblerResult) {
    const line = assemblerResult.addressToLine.get(cpu.pc);
    if (line !== undefined) highlightLine(line);
  }
  updateButtonStates();
}

// ---- run ----------------------------------------------------
function doRun(): void {
  if (cpu.halted || dbg.running) return;
  showStatus('Running...');
  debugRun(cpu, dbg);
  updateButtonStates();
}

// ---- stop ---------------------------------------------------
function doStop(): void {
  debugStop(dbg);
  showStatus('Stopped');
  updateAll(cpu);
  updateButtonStates();
}

// ---- reset --------------------------------------------------
function doReset(): void {
  debugReset(cpu, dbg);
  applyInput();
  showErrors([]);
  showStatus('Reset');
  updateLineNumbers();
  updateAll(cpu);
  updateButtonStates();
}

// ---- load example -------------------------------------------
function loadExample(name: string): void {
  const src = examples[name];
  if (src) {
    setEditorSource(src);
    doReset();
    showStatus(`Loaded example: ${name}`);
  }
}

// ---- init ---------------------------------------------------
function init(): void {
  setBreakpointSet(dbg.breakpoints);

  // click a source line in the gutter to toggle a breakpoint on that instruction.
  initEditorSync((line) => {
    const addr = lineToAddr(line);
    if (addr === undefined) {
      showStatus('Assemble first, then click a code line to set a breakpoint.');
      return;
    }
    const added = toggleBreakpoint(dbg, addr);
    showStatus(`${added ? 'Set' : 'Cleared'} breakpoint at line ${line + 1} (0x${addr.toString(16).toUpperCase().padStart(4, '0')})`);
    refreshBreakpointViews();
  });

  // clicking a memory cell still toggles a breakpoint at that raw address.
  initMemoryControls(cpu, (addr) => {
    const added = toggleBreakpoint(dbg, addr);
    showStatus(`${added ? 'Set' : 'Cleared'} breakpoint at 0x${addr.toString(16).toUpperCase().padStart(4, '0')} (${dbg.breakpoints.size} total)`);
    refreshBreakpointViews();
  });

  // wire buttons
  document.getElementById('btn-assemble')!.addEventListener('click', doAssemble);
  document.getElementById('btn-step')!.addEventListener('click', doStep);
  document.getElementById('btn-step-over')!.addEventListener('click', doStepOver);
  document.getElementById('btn-run')!.addEventListener('click', doRun);
  document.getElementById('btn-stop')!.addEventListener('click', doStop);
  document.getElementById('btn-reset')!.addEventListener('click', doReset);

  // save / load / download / upload programs
  document.getElementById('btn-save')!.addEventListener('click', () => {
    const name = prompt('Save program as:');
    if (!name) return;
    localStorage.setItem(SAVE_PREFIX + name, getEditorSource());
    refreshSavedList();
    (document.getElementById('saved-select') as HTMLSelectElement).value = name;
    showStatus(`Saved "${name}"`);
  });

  document.getElementById('btn-delete-saved')!.addEventListener('click', () => {
    const select = document.getElementById('saved-select') as HTMLSelectElement;
    if (!select.value) return;
    localStorage.removeItem(SAVE_PREFIX + select.value);
    showStatus(`Deleted "${select.value}"`);
    refreshSavedList();
  });

  (document.getElementById('saved-select') as HTMLSelectElement).addEventListener('change', (e) => {
    const name = (e.target as HTMLSelectElement).value;
    if (!name) return;
    const src = localStorage.getItem(SAVE_PREFIX + name);
    if (src !== null) {
      setEditorSource(src);
      doReset();
      showStatus(`Loaded "${name}"`);
    }
  });

  document.getElementById('btn-download')!.addEventListener('click', () => {
    const blob = new Blob([getEditorSource()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'program.asm';
    a.click();
    URL.revokeObjectURL(url);
  });

  (document.getElementById('file-upload') as HTMLInputElement).addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setEditorSource(String(reader.result));
      doReset();
      showStatus(`Loaded ${file.name}`);
    };
    reader.readAsText(file);
    (e.target as HTMLInputElement).value = ''; // allow re-uploading the same file
  });

  // speed slider
  const speedSlider = document.getElementById('speed-slider') as HTMLInputElement;
  speedSlider.addEventListener('input', () => {
    dbg.speed = parseInt(speedSlider.value);
    updateSpeedDisplay(dbg.speed);
  });
  updateSpeedDisplay(dbg.speed);

  // example selector
  const exampleSelect = document.getElementById('example-select') as HTMLSelectElement;
  exampleSelect.addEventListener('change', () => {
    if (exampleSelect.value) {
      loadExample(exampleSelect.value);
      exampleSelect.value = '';
    }
  });

  // keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F5' || (e.ctrlKey && e.key === 'Enter')) {
      e.preventDefault();
      if (dbg.running) doStop(); else doRun();
    } else if (e.key === 'F10' || (e.ctrlKey && e.key === '.')) {
      e.preventDefault();
      doStep();
    } else if (e.key === 'F11') {
      e.preventDefault();
      doStepOver();
    } else if (e.key === 'F6') {
      e.preventDefault();
      doAssemble();
    }
  });

  // populate the saved-programs dropdown from localstorage
  refreshSavedList();

  // load default example
  setEditorSource(helloAsm);
  showStatus('Ready. Press Assemble (F6) to compile, then Step (F10) or Run (F5). Click a line number to set a breakpoint.');
  updateAll(cpu);
  updateButtonStates();
}

document.addEventListener('DOMContentLoaded', init);

// ============================================================
// cpucraft - Main: wire everything together
// ============================================================

import { createCPU, resetCPU } from './cpu';
import { assemble } from './assembler';
import { createDebugger, debugStep, debugRun, debugStop, debugReset, toggleBreakpoint } from './debugger';
import {
  updateAll, getEditorSource, setEditorSource, showErrors, showStatus,
  highlightLine, initEditorSync, initMemoryControls, updateSpeedDisplay,
  updateLineNumbers, setMemViewAddr, updateMemory,
} from './ui';

// Example programs
import helloAsm from '../examples/hello.asm?raw';
import fibAsm from '../examples/fibonacci.asm?raw';
import sortAsm from '../examples/sort.asm?raw';

const examples: Record<string, string> = {
  hello: helloAsm,
  fibonacci: fibAsm,
  sort: sortAsm,
};

// ---- State --------------------------------------------------
const cpu = createCPU();
const dbg = createDebugger();
let assemblerResult: ReturnType<typeof assemble> | null = null;

// ---- Callbacks ----------------------------------------------
dbg.onStep = (instrAddr: number) => {
  updateAll(cpu);
  // Highlight source line
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

// ---- Button state management --------------------------------
function updateButtonStates(): void {
  const assembleBtn = document.getElementById('btn-assemble') as HTMLButtonElement;
  const stepBtn = document.getElementById('btn-step') as HTMLButtonElement;
  const runBtn = document.getElementById('btn-run') as HTMLButtonElement;
  const stopBtn = document.getElementById('btn-stop') as HTMLButtonElement;
  const resetBtn = document.getElementById('btn-reset') as HTMLButtonElement;

  assembleBtn.disabled = dbg.running;
  stepBtn.disabled = dbg.running || cpu.halted;
  runBtn.disabled = dbg.running || cpu.halted;
  stopBtn.disabled = !dbg.running;
  resetBtn.disabled = false;
}

// ---- Assemble -----------------------------------------------
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

  // Load machine code into memory at address 0
  for (let i = 0; i < assemblerResult.machineCode.length; i++) {
    cpu.memory[i] = assemblerResult.machineCode[i];
  }

  showStatus(`Assembled: ${assemblerResult.machineCode.length} words loaded. Symbols: ${[...assemblerResult.symbolTable.entries()].map(([k, v]) => `${k}=0x${v.toString(16)}`).join(', ') || 'none'}`);
  setMemViewAddr(0);
  updateAll(cpu);
  updateButtonStates();
}

// ---- Step ---------------------------------------------------
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

// ---- Run ----------------------------------------------------
function doRun(): void {
  if (cpu.halted || dbg.running) return;
  showStatus('Running...');
  debugRun(cpu, dbg);
  updateButtonStates();
}

// ---- Stop ---------------------------------------------------
function doStop(): void {
  debugStop(dbg);
  showStatus('Stopped');
  updateAll(cpu);
  updateButtonStates();
}

// ---- Reset --------------------------------------------------
function doReset(): void {
  debugReset(cpu, dbg);
  showErrors([]);
  showStatus('Reset');
  updateLineNumbers();
  updateAll(cpu);
  updateButtonStates();
}

// ---- Load example -------------------------------------------
function loadExample(name: string): void {
  const src = examples[name];
  if (src) {
    setEditorSource(src);
    doReset();
    showStatus(`Loaded example: ${name}`);
  }
}

// ---- Init ---------------------------------------------------
function init(): void {
  initEditorSync();
  initMemoryControls(cpu);

  // Wire buttons
  document.getElementById('btn-assemble')!.addEventListener('click', doAssemble);
  document.getElementById('btn-step')!.addEventListener('click', doStep);
  document.getElementById('btn-run')!.addEventListener('click', doRun);
  document.getElementById('btn-stop')!.addEventListener('click', doStop);
  document.getElementById('btn-reset')!.addEventListener('click', doReset);

  // Speed slider
  const speedSlider = document.getElementById('speed-slider') as HTMLInputElement;
  speedSlider.addEventListener('input', () => {
    dbg.speed = parseInt(speedSlider.value);
    updateSpeedDisplay(dbg.speed);
  });
  updateSpeedDisplay(dbg.speed);

  // Example selector
  const exampleSelect = document.getElementById('example-select') as HTMLSelectElement;
  exampleSelect.addEventListener('change', () => {
    if (exampleSelect.value) {
      loadExample(exampleSelect.value);
      exampleSelect.value = '';
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F5' || (e.ctrlKey && e.key === 'Enter')) {
      e.preventDefault();
      if (dbg.running) doStop(); else doRun();
    } else if (e.key === 'F10' || (e.ctrlKey && e.key === '.')) {
      e.preventDefault();
      doStep();
    } else if (e.key === 'F6') {
      e.preventDefault();
      doAssemble();
    }
  });

  // Load default example
  setEditorSource(helloAsm);
  showStatus('Ready. Press Assemble (F6) to compile, then Step (F10) or Run (F5).');
  updateAll(cpu);
  updateButtonStates();
}

document.addEventListener('DOMContentLoaded', init);

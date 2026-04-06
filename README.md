# cpucraft

A browser-based interactive 16-bit CPU emulator with a built-in assembler, step debugger, and real-time visualization. No backend required -- everything runs client-side.

![Screenshot placeholder](screenshot.png)

## Features

- **16-bit CPU core** with 8 general-purpose registers, flags, stack pointer, and 64KB memory
- **Full assembler** with labels, comments, data directives, and helpful error messages
- **Step debugger** with breakpoints, run/stop/reset, and adjustable execution speed
- **Real-time visualization** of registers (with change highlighting), memory hex dump, and output console
- **Dark terminal aesthetic** with monospace fonts and a retro feel
- **Pre-loaded examples**: hello world, fibonacci, bubble sort
- **Keyboard shortcuts**: F6 (assemble), F10 (step), F5 (run/stop)

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

To build for production:

```bash
npm run build
```

## Architecture

### How the CPU Works

The CPU follows the classic **fetch-decode-execute** cycle:

1. **Fetch**: Read the instruction word from memory at the address in the Program Counter (PC). Increment PC.
2. **Decode**: Extract the opcode, addressing mode, and register fields from the instruction word. If the instruction uses an immediate value, fetch the next word too.
3. **Execute**: Perform the operation (ALU computation, memory access, jump, etc.) and update registers/flags.
4. **Repeat** until a HLT instruction is encountered.

### Instruction Encoding

Each instruction is 1-2 words (16 bits each):

```
Word 0: [opcode:8][mode:2][regA:3][regB:3]
Word 1: [immediate/address:16]  (optional)
```

Addressing modes:
- `0` = register, register
- `1` = register, immediate
- `2` = register, [address]
- `3` = [address], register

### Registers

| Register | Description |
|----------|-------------|
| R0-R7 | General purpose (16-bit) |
| PC | Program counter |
| SP | Stack pointer (starts at 0xFFFE, grows downward) |
| FLAGS | Zero (Z), Carry (C), Negative (N), Overflow (O) |

## Instruction Set

| Opcode | Syntax | Description |
|--------|--------|-------------|
| `MOV` | `MOV Rd, Rs/imm` | Copy value to register |
| `ADD` | `ADD Rd, Rs/imm` | Rd = Rd + operand, updates flags |
| `SUB` | `SUB Rd, Rs/imm` | Rd = Rd - operand, updates flags |
| `MUL` | `MUL Rd, Rs/imm` | Rd = Rd * operand |
| `DIV` | `DIV Rd, Rs/imm` | Rd = Rd / operand (integer, halts on div-by-zero) |
| `AND` | `AND Rd, Rs/imm` | Bitwise AND |
| `OR` | `OR Rd, Rs/imm` | Bitwise OR |
| `XOR` | `XOR Rd, Rs/imm` | Bitwise XOR |
| `NOT` | `NOT Rd` | Bitwise NOT (complement) |
| `SHL` | `SHL Rd, Rs/imm` | Shift left |
| `SHR` | `SHR Rd, Rs/imm` | Shift right (logical) |
| `CMP` | `CMP Rd, Rs/imm` | Compare (subtract without storing, sets flags) |
| `JMP` | `JMP label/addr` | Unconditional jump |
| `JEQ` | `JEQ label/addr` | Jump if zero flag set |
| `JNE` | `JNE label/addr` | Jump if zero flag clear |
| `JGT` | `JGT label/addr` | Jump if greater (not zero, not negative) |
| `JLT` | `JLT label/addr` | Jump if less (negative flag set) |
| `JGE` | `JGE label/addr` | Jump if greater or equal |
| `JLE` | `JLE label/addr` | Jump if less or equal |
| `PUSH` | `PUSH Rs` | Push register onto stack |
| `POP` | `POP Rd` | Pop from stack into register |
| `CALL` | `CALL label/addr` | Push PC, jump to address |
| `RET` | `RET` | Pop PC (return from call) |
| `LOAD` | `LOAD Rd, [addr/Rs]` | Load from memory into register |
| `STORE` | `STORE [addr/Rs], Rs` | Store register value to memory |
| `IN` | `IN Rd` | Read input into register |
| `OUT` | `OUT Rs` | Output register value (shown in output console) |
| `INC` | `INC Rd` | Increment register by 1 |
| `DEC` | `DEC Rd` | Decrement register by 1 |
| `NOP` | `NOP` | No operation |
| `HLT` | `HLT` | Halt execution |

## Example Walkthrough: Fibonacci

```asm
  MOV R0, 0         ; a = 0 (first fibonacci number)
  MOV R1, 1         ; b = 1 (second fibonacci number)
  MOV R3, 0         ; counter = 0
  MOV R4, 0x0100    ; base address for storing results
  MOV R5, 10        ; compute 10 numbers

loop:
  STORE [R4], R0    ; store current number in memory
  OUT R0            ; output it
  MOV R2, R0        ; temp = a
  ADD R2, R1        ; temp = a + b
  MOV R0, R1        ; a = b
  MOV R1, R2        ; b = temp (= a + b)
  INC R4            ; next memory slot
  INC R3            ; counter++
  CMP R3, R5        ; done yet?
  JNE loop          ; nope, keep going
  HLT               ; done
```

This computes: 0, 1, 1, 2, 3, 5, 8, 13, 21, 34 and stores them at memory addresses 0x0100-0x0109.

**Step through it** to watch the registers update in real time, see the values appear in the memory viewer, and observe the output buffer fill up.

## Assembly Syntax

- **Comments**: Everything after `;` is a comment
- **Labels**: A word followed by `:` defines a label (e.g., `loop:`)
- **Immediates**: Decimal (`42`), hex (`0xFF`), binary (`0b1010`), or char (`'A'`)
- **Data**: `.data 1, 2, 3` places raw values in memory
- **Registers**: `R0` through `R7`
- **Memory**: `[addr]` or `[Rs]` for indirect addressing

## Architecture Decisions

- **Single-page app**: Zero backend, runs entirely in the browser. Just serve the static files.
- **TypeScript + Vite**: Type safety during development, fast HMR, zero-config bundling.
- **Uint16Array for memory**: Native typed array for 64K words, fast and memory-efficient.
- **Instruction encoding in 16-bit words**: Keeps the architecture simple and consistent. Immediates take an extra word.
- **No WebAssembly**: Deliberate choice -- TypeScript is fast enough for a 16-bit emulator and keeps the code readable and hackable.

## vs Pratham's 16-Bit_CPU_Scratch_C

| | Pratham's | cpucraft |
|---|---|---|
| Language | C (~4KB) | TypeScript |
| Visualization | None (terminal output) | Full real-time UI |
| Debugger | None | Step, run, breakpoints, speed control |
| Assembler | Basic | Labels, comments, data directives, error messages |
| Memory viewer | None | Scrollable hex dump with PC highlighting |
| Register display | None | Live updates with change highlighting |
| Output | stdout | In-browser output console |
| Platform | Compile & run | Open a browser |
| Examples | None | 3 pre-loaded programs |

## License

MIT

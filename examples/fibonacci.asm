; ==========================================
; fibonacci.asm - First 10 Fibonacci numbers
; ==========================================
; Computes fib(0)..fib(9) and stores them
; starting at memory address 0x0100.
; Also outputs each value.
;
; R0 = current fib number (a)
; R1 = next fib number (b)
; R2 = temp
; R3 = counter
; R4 = store address
; R5 = limit (10)

  MOV R0, 0         ; a = 0
  MOV R1, 1         ; b = 1
  MOV R3, 0         ; counter = 0
  MOV R4, 0x0100    ; base address for results
  MOV R5, 10        ; limit

loop:
  STORE [R4], R0    ; mem[addr] = a
  OUT R0            ; output current number
  MOV R2, R0        ; temp = a
  ADD R2, R1        ; temp = a + b
  MOV R0, R1        ; a = b
  MOV R1, R2        ; b = temp
  INC R4            ; addr++
  INC R3            ; counter++
  CMP R3, R5        ; counter == limit?
  JNE loop          ; if not, continue

  HLT

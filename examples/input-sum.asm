; ==========================================
; input-sum.asm - Sum values from the input queue
; ==========================================
; Reads 5 numbers from the input queue with IN,
; adds them up, and outputs the total with OUT.
; Fill the Input box (e.g. "10 20 30 40 50")
; before assembling, then Run.
;
; R0 = running sum
; R1 = count of numbers to read (5)
; R2 = loop counter

  MOV R0, 0         ; sum = 0
  MOV R1, 5         ; read 5 numbers
  MOV R2, 0         ; i = 0

loop:
  IN R3             ; R3 = next input value
  ADD R0, R3        ; sum += R3
  INC R2            ; i++
  CMP R2, R1        ; read them all?
  JNE loop          ; if not, keep reading

  OUT R0            ; output the sum
  HLT

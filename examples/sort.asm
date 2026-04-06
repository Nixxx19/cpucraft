; ==========================================
; sort.asm - Bubble sort 5 numbers
; ==========================================
; Sorts an array of 5 numbers stored at
; address 0x0200 in ascending order.
;
; R0 = outer loop counter (i)
; R1 = inner loop counter (j)
; R2 = array base address
; R3 = temp: mem[j]
; R4 = temp: mem[j+1]
; R5 = address pointer
; R6 = n-1 (number of passes)
; R7 = inner limit

; First, store 5 unsorted values into memory
  MOV R0, 42
  STORE 0x0200, R0
  MOV R0, 17
  STORE 0x0201, R0
  MOV R0, 93
  STORE 0x0202, R0
  MOV R0, 5
  STORE 0x0203, R0
  MOV R0, 28
  STORE 0x0204, R0

; Setup
  MOV R2, 0x0200    ; base address
  MOV R6, 4         ; n-1 = 4 passes
  MOV R0, 0         ; i = 0

outer:
  CMP R0, R6        ; if i >= n-1, done
  JGE done
  MOV R1, 0         ; j = 0
  ; inner limit = n-1-i
  MOV R7, R6
  SUB R7, R0

inner:
  CMP R1, R7        ; if j >= inner limit, next pass
  JGE next_pass

  ; Calculate addr of arr[j]
  MOV R5, R2
  ADD R5, R1        ; R5 = base + j
  LOAD R3, [R5]     ; R3 = arr[j]
  INC R5            ; R5 = base + j + 1
  LOAD R4, [R5]     ; R4 = arr[j+1]

  ; Compare and swap if needed
  CMP R3, R4
  JLE no_swap

  ; Swap: store R4 at [j], R3 at [j+1]
  DEC R5            ; R5 = base + j
  STORE [R5], R4    ; arr[j] = R4 (smaller)
  INC R5            ; R5 = base + j + 1
  STORE [R5], R3    ; arr[j+1] = R3 (larger)

no_swap:
  INC R1            ; j++
  JMP inner

next_pass:
  INC R0            ; i++
  JMP outer

done:
  ; Output sorted array
  MOV R0, 0         ; counter
  MOV R1, 5         ; limit
  MOV R5, 0x0200    ; base

print_loop:
  CMP R0, R1
  JGE finish
  LOAD R3, [R5]
  OUT R3
  INC R5
  INC R0
  JMP print_loop

finish:
  HLT

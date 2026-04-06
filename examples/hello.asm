; ==========================================
; hello.asm - Print "HELLO WORLD" to output
; ==========================================
; Uses OUT instruction to send ASCII values
; to the output buffer.

  MOV R0, 72       ; 'H'
  OUT R0
  MOV R0, 69       ; 'E'
  OUT R0
  MOV R0, 76       ; 'L'
  OUT R0
  MOV R0, 76       ; 'L'
  OUT R0
  MOV R0, 79       ; 'O'
  OUT R0
  MOV R0, 32       ; ' '
  OUT R0
  MOV R0, 87       ; 'W'
  OUT R0
  MOV R0, 79       ; 'O'
  OUT R0
  MOV R0, 82       ; 'R'
  OUT R0
  MOV R0, 76       ; 'L'
  OUT R0
  MOV R0, 68       ; 'D'
  OUT R0
  HLT

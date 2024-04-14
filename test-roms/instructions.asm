;
; instructions.asm - simple test of CP1600 instructions
;

        ROMW    16      
        ORG     $4800

MAIN:   
        EIS                 ; Enable interrupts
        DIS                 ; Enable interrupts
        SDBD                ; Set double byte data
        NOP                 ; No-op (ignore SDBD)
        
        TCI                 ; Terminate current interrupt

        SETC                ; Set the carry flag
        CLRC                ; Clear the carry flag

        INCR R0             ; Increment register 0
        INCR R1             ; Increment register 1
        INCR R2             ; Increment register 2
        INCR R3             ; Increment register 3
        INCR R4             ; Increment register 4
        INCR R5             ; Increment register 5
        INCR R6             ; Increment register 6
        INCR R7             ; Increment register 7

        NOP

        DECR R0             ; Decrement register 0
        DECR R1             ; Decrement register 1
        DECR R2             ; Decrement register 2
        DECR R3             ; Decrement register 3
        DECR R4             ; Decrement register 4
        DECR R5             ; Decrement register 5
        DECR R6             ; Decrement register 6

        COMR R0             ; Complement register 0
        COMR R0             ; Complement register 0
        COMR R1             ; Complement register 1
        COMR R1             ; Complement register 1
        COMR R2             ; Complement register 2
        COMR R2             ; Complement register 2
        COMR R3             ; Complement register 3
        COMR R3             ; Complement register 3
        COMR R4             ; Complement register 4
        COMR R4             ; Complement register 4
        COMR R5             ; Complement register 5
        COMR R5             ; Complement register 5
        COMR R6             ; Complement register 6
        COMR R6             ; Complement register 6

        MVII #$0000, R0     ; Set up a test for carry flag
        NEGR R0             ; Negate register 0
        MVII #$8000, R0     ; Set up a test for overflow flag
        NEGR R0             ; Negate register 0

        NEGR R1             ; Negate register 1
        NEGR R2             ; Negate register 2
        NEGR R3             ; Negate register 3
        NEGR R4             ; Negate register 4
        NEGR R5             ; Negate register 5
        NEGR R6             ; Negate register 6

        MVII #$7FFF, R0     ; Set up a test for carry flag
        SETC                ; Set carry flag to test set behavior
        ADCR R0             ; Add carry to register 0
        GSWD R1             ; Get flags

        MVII #$0000, R0     ; Set up a test for carry flag
        SETC                ; Set carry flag to test set behavior
        ADCR R0             ; Add carry to register 0
        GSWD R1             ; Get flags

        SETC                ; Set carry flag to test set behavior
        ADCR R1             ; Add carry to register 1
        SETC                ; Set carry flag to test set behavior
        ADCR R2             ; Add carry to register 2
        SETC                ; Set carry flag to test set behavior
        ADCR R3             ; Add carry to register 3
        SETC                ; Set carry flag to test set behavior
        ADCR R4             ; Add carry to register 4
        SETC                ; Set carry flag to test set behavior
        ADCR R5             ; Add carry to register 5
        SETC                ; Set carry flag to test set behavior
        ADCR R6             ; Add carry to register 6
        SETC                ; Set carry flag to test set behavior
        ADCR R7             ; Add carry to register 7

        NOP

        CLRC                ; Clear carry flag to test clear behavior
        ADCR R0             ; Add carry to register 0
        ADCR R1             ; Add carry to register 1
        ADCR R2             ; Add carry to register 2
        ADCR R3             ; Add carry to register 3
        ADCR R4             ; Add carry to register 4
        ADCR R5             ; Add carry to register 5
        ADCR R6             ; Add carry to register 6
        ADCR R7             ; Add carry to register 7

        MVII #$00F0, R0     ; Set all flags on pattern in register 0
        RSWD R0             ; Test RSWD
        MVII #$0000, R0     ; Clear all flags on pattern in register 0
        RSWD R0             ; Test RSWD

        MVII #$00F0, R1     ; Set all flags on pattern in register 1
        RSWD R1             ; Test RSWD
        MVII #$0000, R1     ; Clear all flags on pattern in register 1
        RSWD R1             ; Test RSWD

        MVII #$00F0, R2     ; Set all flags on pattern in register 2
        RSWD R2             ; Test RSWD
        MVII #$0000, R2     ; Clear all flags on pattern in register 2
        RSWD R2             ; Test RSWD

        MVII #$00F0, R3     ; Set all flags on pattern in register 3
        RSWD R3             ; Test RSWD
        MVII #$0000, R3     ; Clear all flags on pattern in register 3
        RSWD R3             ; Test RSWD

        MVII #$00F0, R4     ; Set all flags on pattern in register 4
        RSWD R4             ; Test RSWD
        MVII #$0000, R4     ; Clear all flags on pattern in register 4
        RSWD R4             ; Test RSWD

        MVII #$00F0, R5     ; Set all flags on pattern in register 5
        RSWD R5             ; Test RSWD
        MVII #$0000, R5     ; Clear all flags on pattern in register 5
        RSWD R5             ; Test RSWD

        MVII #$00F0, R6     ; Set all flags on pattern in register 6
        RSWD R6             ; Test RSWD
        MVII #$0000, R6     ; Clear all flags on pattern in register 6
        RSWD R6             ; Test RSWD

        MVII #$FF00, R0     ; Test sign flag behavior of SWAP
        SWAP R0, 1

        MVII #$00FF, R0     ; Test sign flag behavior of double SWAP
        SWAP R0, 2

        MVII #$FF00, R0     ; Test zero flag behavior of double SWAP
        SWAP R0, 2

        MVII #$0001, R0
        SLL R0

        NOP

        HLT
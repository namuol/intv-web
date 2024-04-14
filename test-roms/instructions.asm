;
; instructions.asm - simple test of CP1600 instructions
;
; This program does not validate any of its own results, so running it in an
; emulator won't appear to really _do_ anything.
;
; Instead, it's meant to be used with an emulator to produce a debug log of the
; state of the machine at each step of the program.
;
; This debug log can then be compared against a reference debug from another
; emulator to compare results.
;
; In particular this is useful for very early development of CP1600 emulators,
; as it does not rely on external bus devices nor interrupts.

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

        ;
        ; INCR
        ;

        INCR R0             ; Increment register 0
        INCR R1             ; Increment register 1
        INCR R2             ; Increment register 2
        INCR R3             ; Increment register 3
        INCR R4             ; Increment register 4
        INCR R5             ; Increment register 5
        INCR R6             ; Increment register 6
        INCR R7             ; Increment register 7

        NOP

        ;
        ; DECR
        ;

        DECR R0             ; Decrement register 0
        DECR R1             ; Decrement register 1
        DECR R2             ; Decrement register 2
        DECR R3             ; Decrement register 3
        DECR R4             ; Decrement register 4
        DECR R5             ; Decrement register 5
        DECR R6             ; Decrement register 6

        ;
        ; COMR
        ;

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

        ;
        ; NEGR
        ;

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

        ;
        ; GSWD
        ;

        MVII #$7FFF, R0     ; Set up a test for carry flag
        SETC                ; Set carry flag to test set behavior
        ADCR R0             ; Add carry to register 0
        GSWD R1             ; Get flags

        MVII #$0000, R0     ; Set up a test for carry flag
        SETC                ; Set carry flag to test set behavior
        ADCR R0             ; Add carry to register 0
        GSWD R1             ; Get flags
        
        ;
        ; ADCR
        ;

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

        ;
        ; RSWD
        ;

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

        ;
        ; SWAP
        ;

        MVII #$FF00, R0     ; Test sign flag behavior of SWAP
        SWAP R0, 1

        MVII #$00FF, R0     ; Test sign flag behavior of double SWAP
        SWAP R0, 2

        MVII #$FF00, R0     ; Test zero flag behavior of double SWAP
        SWAP R0, 2

        ;
        ; SLL
        ;

        MVII #$0001, R0
        SLL R0              ; Shift left
        SLL R0, 2           ; Shift left twice

        MVII #$4000, R0     
        SLL R0              ; Test logical shift sign flag
        SLL R0              ; Test logical shift zero flag

        MVII #$2000, R0     
        SLL R0, 2           ; Test logical double shift sign flag

        MVII #$4000, R0     
        SLL R0, 2           ; Test logical double shift zero flag

        MVII #$0030, R1     ; Should leave O and C flags alone
        RSWD R1
        MVII #$0001, R0
        SLL R0              ; Shift left
        SLL R0, 2           ; Shift left twice

        ;
        ; RLC
        ;

        MVII #$0001, R0
        CLRC                ; Ensure carry flag is unset
        RLC R0              ; Shift left

        MVII #$0000, R1     ; Clear all flags (carry and overflow)
        RSWD R1             ;
        RLC R0, 2           ; Shift left twice

        MVII #$0001, R0
        SETC                ; Set the carry flag so we can test carry-through behavior
        RLC R0              ; Shift left

        MVII #$0030, R1     ; Set carry and overflow flag
        RSWD R1             ;
        RLC R0, 2           ; Shift left twice; should pull in overflow and carry bits

        MVII #$4000, R0     
        CLRC                ; Ensure carry flag is unset
        RLC R0              ; Test shift sign flag
        CLRC                ; Ensure carry flag is unset
        RLC R0              ; Test shift zero flag

        MVII #$4000, R0
        SETC                ; Set the carry flag so we can test carry-through behavior
        RLC R0              ; Test shift sign flag
        SETC                ; Set the carry flag so we can test carry-through behavior
        RLC R0              ; Test shift zero flag

        MVII #$2000, R0     
        MVII #$0000, R1     ; Clear all flags (carry and overflow)
        RSWD R1             ;
        RLC R0, 2           ; Test double shift sign flag

        MVII #$4000, R0     
        MVII #$0000, R1     ; Clear all flags (carry and overflow)
        RSWD R1             ;
        RLC R0, 2           ; Test double shift zero flag

        MVII #$2000, R0     
        MVII #$0030, R1     ; Set carry and overflow flag
        RSWD R1             ;
        RLC R0, 2           ; Test double shift sign flag

        MVII #$4000, R0     
        MVII #$0030, R1     ; Set carry and overflow flag
        RSWD R1             ;
        RLC R0, 2           ; Test double shift zero flag

        ;
        ; SLLC
        ;
        MVII #$0000, R1     ; Clear flags
        RSWD R1

        MVII #$0001, R0
        SLLC R0              ; Shift left (no carry)
        SLLC R0, 2           ; Shift left twice (no carry)
        
        MVII #$4000, R0
        SLLC R0              ; Shift left, sign flag test

        MVII #$8000, R0
        SLLC R0              ; Shift left into carry

        MVII #$C000, R0
        SLLC R0, 2           ; Shift left twice, into carry and overflow
        
        ;
        ; SLR
        ;

        MVII #$0030, R1     ; Should leave O and C flags alone
        RSWD R1
        MVII #$0001, R0     ; Shift right, zero flag test
        SLR R0

        MVII #$0030, R1     ; Should leave O and C flags alone
        RSWD R1
        MVII #$0100, R0     ; Shift right, sign flag test
        SLR R0

        MVII #$0030, R1     ; Should leave O and C flags alone
        RSWD R1
        MVII #$0200, R0     ; Shift right twice, sign flag test
        SLR R0, 2

        ;
        ; SAR
        ;

        MVII #$0030, R1     ; Should leave O and C flags alone
        RSWD R1
        MVII #$8000, R0     ; Should copy the sign bit
        SAR R0

        MVII #$0030, R1     ; Should leave O and C flags alone
        RSWD R1
        MVII #$8000, R0     ; Should copy the sign bit twice
        SAR R0, 2

        MVII #$0030, R1     ; Should leave O and C flags alone
        RSWD R1
        MVII #$0100, R0     ; Shift right, test sign flag
        SAR R0

        MVII #$0030, R1     ; Should leave O and C flags alone
        RSWD R1
        MVII #$0200, R0     ; Shift right twice, test sign flag
        SAR R0, 2

        ;
        ; RRC
        ;

        MVII #$0000, R1     ; Set no flags
        RSWD R1
        MVII #$0000, R0
        RRC R0              ; Should copy 0 into leftmost bit

        MVII #$0000, R1     ; Set no flags
        RSWD R1
        MVII #$0000, R0
        RRC R0, 2           ; Should copy 00 into leftmost bits


        MVII #$0010, R1     ; Set just carry flag
        RSWD R1
        MVII #$0000, R0
        RRC R0              ; Should copy 1 into leftmost bit

        MVII #$0010, R1     ; Set just carry flag
        RSWD R1
        MVII #$0000, R0
        RRC R0, 2           ; Should copy 01 into leftmost bits


        MVII #$0020, R1     ; Set just overflow flag
        RSWD R1
        MVII #$0000, R0
        RRC R0              ; Should copy 0 into leftmost bit

        MVII #$0020, R1     ; Set just overflow flag
        RSWD R1
        MVII #$0000, R0
        RRC R0, 2           ; Should copy 10 into leftmost bits


        MVII #$0030, R1     ; Set both overflow and carry flags
        RSWD R1
        MVII #$0000, R0
        RRC R0              ; Should copy 1 into leftmost bit

        MVII #$0030, R1     ; Set both overflow and carry flags
        RSWD R1
        MVII #$0000, R0
        RRC R0, 2           ; Should copy 11 into leftmost bits


        MVII #$0000, R1     ; Clear flags
        RSWD R1
        MVII #$0100, R0     ; Shift right, test sign flag
        RRC R0

        MVII #$0000, R1     ; Clear flags
        RSWD R1
        MVII #$0200, R0     ; Shift right twice, test sign flag
        RRC R0, 2

        ;
        ; SARC
        ;

        MVII #$0030, R1     ; Should clear the carry flag
        RSWD R1
        MVII #$8000, R0     ; Should copy the sign bit
        SARC R0

        MVII #$0030, R1     ; Should clear the carry and overflow flags
        RSWD R1
        MVII #$8000, R0     ; Should copy the sign bit twice
        SARC R0, 2

        MVII #$0000, R1     ; Should set the carry flag
        RSWD R1
        MVII #$8001, R0     ; Should copy the sign bit
        SARC R0

        MVII #$0000, R1     ; Should set the carry and overflow flags
        RSWD R1
        MVII #$8003, R0     ; Should copy the sign bit twice
        SARC R0, 2

        HLT
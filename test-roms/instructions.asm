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
        ;
        ; CPU Control / Misc
        ;

        EIS                 ; Enable interrupts
        DIS                 ; Enable interrupts
        SDBD                ; Set double byte data
        NOP                 ; No-op (ignore SDBD)
        
        TCI                 ; Terminate current interrupt

        SETC                ; Set the carry flag
        CLRC                ; Clear the carry flag

        ;
        ; Jump instructions
        ;

        MVII #$0000, R0     ; Clear flags
        RSWD R0

        J J_DEST
        HLT
J_DEST:
        MVII #$0000, R0     ; Clear flags
        RSWD R0

        JE JE_DEST
        HLT
JE_DEST:
        MVII #$0000, R0     ; Clear flags
        RSWD R0

        JD JD_DEST
        HLT
JD_DEST:
        MVII #$0000, R0     ; Clear flags
        RSWD R0

        JSR R4, JSR_DEST_R4
        HLT
JSR_DEST_R4:
        MVII #$0000, R0     ; Clear flags
        RSWD R0

        JSR R5, JSR_DEST_R5
        HLT
JSR_DEST_R5:
        MVII #$0000, R0     ; Clear flags
        RSWD R0

        JSR R6, JSR_DEST_R6
        HLT
JSR_DEST_R6:
        MVII #$0000, R0     ; Clear flags
        RSWD R0

        JSRE R4, JSRE_DEST_R4
        HLT
JSRE_DEST_R4:
        MVII #$0000, R0     ; Clear flags
        RSWD R0

        JSRE R5, JSRE_DEST_R5
        HLT
JSRE_DEST_R5:
        MVII #$0000, R0     ; Clear flags
        RSWD R0

        JSRE R6, JSRE_DEST_R6
        HLT
JSRE_DEST_R6:
        MVII #$0000, R0     ; Clear flags
        RSWD R0

        JSRD R4, JSRD_DEST_R4
        HLT
JSRD_DEST_R4:
        MVII #$0000, R0     ; Clear flags
        RSWD R0

        JSRD R5, JSRD_DEST_R5
        HLT
JSRD_DEST_R5:
        MVII #$0000, R0     ; Clear flags
        RSWD R0

        JSRD R6, JSRD_DEST_R6
        HLT
JSRD_DEST_R6:
        MVII #$0000, R0     ; Clear flags
        RSWD R0

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

        ;
        ; MOVR
        ;

        MVII #$0000, R0         ; Test zero flag
        MVII #$4242, R1
        MOVR R0, R1

        MVII #$8000, R0         ; Test sign flag
        MVII #$4242, R1
        MOVR R0, R1

        MVII #MOVR_JUMP, R0      
        JR R0                   ; Test `MOVR R0, R7` alias

        HLT

MOVR_JUMP:

        ;
        ; ADDR
        ;

        MVII #$0000, R0         ; Clear flags
        RSWD R0

        MVII #$0000, R0
        MVII #$0000, R1
        ADDR R0, R1

        MVII #$0000, R0         ; Clear flags
        RSWD R0

        MVII #$7FFF, R0         ; Test overflow
        MVII #$0001, R1
        ADDR R0, R1

        MVII #$0000, R0         ; Clear flags
        RSWD R0

        MVII #$FFFF, R0         ; Test carry
        MVII #$0001, R1
        ADDR R0, R1

        ;
        ; SUBR
        ;

        MVII #$0000, R0         ; Clear flags
        RSWD R0

        MVII #$0000, R0         ; Test zero subtraction
        MVII #$0000, R1
        SUBR R0, R1

        MVII #$0000, R0         ; Clear flags
        RSWD R0

        MVII #$0002, R0         ; Test basic subtraction, positive result
        MVII #$0044, R1
        SUBR R0, R1

        MVII #$0000, R0         ; Clear flags
        RSWD R0
        
        MVII #$0044, R0         ; Test basic subtraction, negative result
        MVII #$0002, R1
        SUBR R0, R1

        MVII #$0000, R0         ; Clear flags
        RSWD R0

        ; HACK/Bug in jzIntv?
        ;
        ; For some reason when MVIIing $0001 into R0 and R1 back to back like
        ; this, jzIntv adds an extra bus read of the next program counter before
        ; logging the instruction and reading the program counter again.
        ;
        ; To get around this, I'm loading 2 into each register instead (?!)
        ; which seems to prevent this behavior.
        ;
        ; ```asm
        ; MVII #$0001, R0         ; Test zero flag
        ; MVII #$0001, R1
        ; ```

        MVII #$0002, R0         ; Test zero flag, carry flag
        MVII #$0002, R1
        SUBR R0, R1
        
        MVII #$0000, R0         ; Clear flags
        RSWD R0

        MVII #$0002, R0         ; Test overflow flag, carry flag
        MVII #$8001, R1
        SUBR R0, R1

        ;
        ; CMPR
        ;

        MVII #$0000, R0         ; Clear flags
        RSWD R0

        MVII #$0000, R0         ; Test zero subtraction
        MVII #$0000, R1
        CMPR R0, R1

        MVII #$0000, R0         ; Clear flags
        RSWD R0

        MVII #$0002, R0         ; Test basic subtraction, positive result
        MVII #$0044, R1
        CMPR R0, R1

        MVII #$0000, R0         ; Clear flags
        RSWD R0
        
        MVII #$0044, R0         ; Test basic subtraction, negative result
        MVII #$0002, R1
        CMPR R0, R1

        MVII #$0000, R0         ; Clear flags
        RSWD R0

        ; HACK/Bug in jzIntv?
        ;
        ; For some reason when MVIIing $0001 into R0 and R1 back to back like
        ; this, jzIntv adds an extra bus read of the next program counter before
        ; logging the instruction and reading the program counter again.
        ;
        ; To get around this, I'm loading 2 into each register instead (?!)
        ; which seems to prevent this behavior.
        ;
        ; ```asm
        ; MVII #$0001, R0         ; Test zero flag
        ; MVII #$0001, R1
        ; ```

        MVII #$0002, R0         ; Test zero flag, carry flag
        MVII #$0002, R1
        CMPR R0, R1
        
        MVII #$0000, R0         ; Clear flags
        RSWD R0

        MVII #$0002, R0         ; Test overflow flag, carry flag
        MVII #$8001, R1
        CMPR R0, R1

        ;
        ; ANDR
        ;
        
        MVII #$0000, R0         ; Clear flags
        RSWD R0

        MVII #$FFFF, R0
        MVII #$0000, R1
        ANDR R0, R1             ; Test zero flag

        MVII #$0000, R0         ; Clear flags
        RSWD R0
        
        MVII #$8000, R0
        MVII #$FFFF, R1
        ANDR R0, R1             ; Test sign flag

        ;
        ; XORR
        ;
        
        MVII #$0000, R0         ; Clear flags
        RSWD R0

        MVII #$FFFF, R0
        MVII #$FFFF, R1
        XORR R0, R1             ; Test zero flag

        MVII #$0000, R0         ; Clear flags
        RSWD R0

        MVII #$8000, R0
        MVII #$0000, R1
        XORR R0, R1             ; Test sign flag

        MVII #$0000, R0         ; Clear flags
        RSWD R0

        MVII #$ABCD, R0
        CLRR R0                 ; Test CLRR alias

        ;
        ; MVO
        ;

        JSR R4, CLEAR_R0_THRU_R6
        JSR R4, WRITE_R0_THRU_R6
        MVII #$4242, R4

        MVO R0, $0200
        MVO R1, $0201
        MVO R2, $0202
        MVO R3, $0203
        MVO R4, $0204
        MVO R5, $0205
        MVO R6, $0206
        MVO R7, $0207

        ;
        ; MVO@
        ;

        JSR R4, CLEAR_MEM
        MVII #$4242, R0
        MVII #$0200, R1
        MVII #$0201, R2
        MVII #$0202, R3
        MVII #$0203, R4
        MVII #$0204, R5
        MVII #$0205, R6
        MVO@ R0, R1
        MVO@ R0, R2
        MVO@ R0, R3
        MVO@ R0, R4
        MVO@ R0, R5
        MVO@ R0, R6
        MVO@ R0, R6
        MVO@ R0, R6

        ;
        ; MVOI
        ;
        
        ; FIXME:
        ;MVOI R0, #$1234

        ;
        ; MVI
        ;

        JSR R4, CLEAR_R0_THRU_R6
        CLRR R4
        MVI $0200, R0
        MVI $0200, R0
        MVI $0201, R1
        MVI $0202, R2
        MVI $0203, R3
        MVI $0204, R4
        MVI $0205, R5
        MVI $0206, R6

        MVII #MVI_END, R0
        MVO R0, $207

        MVI $0207, R7

MVI_END:

        ;
        ; MVI@
        ;

        MVII #$0000, R0     ; Clear flags
        RSWD R0
        
        JSR R4, CLEAR_MEM
        JSR R4, CLEAR_R0_THRU_R6
        CLRR R4
        MVII #$4242, R0
        MVO R0, $0200
        MVII #$0200, R1

        ; FIXME:
        MVI@ R1, R2

        HLT

WRITE_R0_THRU_R6:
        MVII #$4242, R0
        MVII #$4242, R1
        MVII #$4242, R2
        MVII #$4242, R3
                                ; Skip R4 since it's our return addr
        MVII #$4242, R5
        MVII #$4242, R6
        JR R4
        HLT

CLEAR_R0_THRU_R6:
        CLRR R0
        CLRR R1
        CLRR R2
        CLRR R3
                                ; Skip R4 since it's our return addr
        CLRR R5
        CLRR R6
        JR R4
        HLT

CLEAR_MEM:
        CLRR R0
        MVO R0, $0200
        MVO R0, $0201
        MVO R0, $0202
        MVO R0, $0203
        MVO R0, $0204
        MVO R0, $0205
        MVO R0, $0206
        MVO R0, $0207
        MVO R0, $0208
        MVO R0, $0209
        MVO R0, $020A
        MVO R0, $020C
        MVO R0, $020D
        MVO R0, $020E
        MVO R0, $020F
        JR R4
        HLT

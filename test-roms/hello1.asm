;
; hello1.asm - from http://wiki.intellivision.us/index.php/Hello_World_Tutorial
;

        ROMW    16      
        ORG     $4800

;------------------------------------------------------------------------------
; EXEC-friendly ROM header.
;------------------------------------------------------------------------------
ROMHDR: BIDECLE ZERO            ; MOB picture base   (points to NULL list)
        BIDECLE ZERO            ; Process table      (points to NULL list)
        BIDECLE MAIN            ; Program start address
        BIDECLE ZERO            ; Bkgnd picture base (points to NULL list)
        BIDECLE ONES            ; GRAM pictures      (points to NULL list)
        BIDECLE TITLE           ; Cartridge title/date
        DECLE   $03C0           ; Flags:  No ECS title, run code after title,
                                ; ... no clicks
ZERO:   DECLE   $0000           ; Screen border control
        DECLE   $0000           ; 0 = color stack, 1 = f/b mode
        BIDECLE ONES            ; GRAM pictures      (points to NULL list)
ONES:   DECLE   1, 1, 1, 1, 1   ; Color stack initialization
;------------------------------------------------------------------------------

TITLE   DECLE   107, "Hello World!", 0

MAIN    EIS                     ; Enable interrupts
here    B       here            ; Spin forever.

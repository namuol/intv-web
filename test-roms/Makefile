SOURCES = $(wildcard *.asm)
BINS = $(SOURCES:.asm=.bin)
CFGS = $(SOURCES:.asm=.cfg)
LSTS = $(SOURCES:.asm=.lst)
LOGS = $(SOURCES:.asm=.jzintv.txt)

all: $(BINS) $(CFGS) $(LOGS)

# "Script" that runs N steps of the emulator, then quits.
4k.jzintv-script: Makefile
	echo "x" > $@
	for i in $$(seq 1 4000); do echo "s"; done >> $@
	echo "q" >> $@

%.bin %.cfg %lst: %.asm
	as1600 -o $@ -l $*.lst $<

%.jzintv.txt: %.bin %.cfg 4k.jzintv-script
	jzintv -d $< --script=4k.jzintv-script | sed 's/^[ \t]*//' | grep -E "^([0-9A-F]{4})|RD|WR" > $@
# Hack to trigger test reruns while editing assembly files:
	touch ../src/cp1610.test.ts

.INTERMEDIATE: 4k.jzintv-script

clean:
	rm -f $(BINS) $(CFGS) $(LSTS) $(LOGS)

.PHONY: all clean
SOURCES = $(wildcard *.asm)
BINS = $(SOURCES:.asm=.bin)
CFGS = $(SOURCES:.asm=.cfg)
LSTS = $(SOURCES:.asm=.lst)
LOGS = $(SOURCES:.asm=.jzintv.txt)

all: $(BINS) $(CFGS) $(LOGS)

# "Script" that runs 1000 steps of the emulator, then quits.
1k.jzintv-script:
	echo "x" > $@
	for i in $$(seq 1 1000); do echo "s"; done >> $@
	echo "q" >> $@

%.bin %.cfg %lst: %.asm
	as1600 -o $@ -l $*.lst $<

%.jzintv.txt: %.bin %.cfg 1k.jzintv-script
	jzintv -d $< --script=1k.jzintv-script | sed 's/^[ \t]*//' | grep -E "^([0-9A-F]{4})|RD|WR" > $@

.INTERMEDIATE: 1k.jzintv-script

clean:
	rm -f $(BINS) $(CFGS) $(LSTS) $(LOGS)

.PHONY: all clean
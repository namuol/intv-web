SOURCES = $(wildcard *.asm)
CFGS = $(SOURCES:.asm=.cfg)
BINS = $(SOURCES:.asm=.bin)
LOGS = $(SOURCES:.asm=.jzintv.txt)

all: $(BINS) $(CFGS) $(LOGS)

# "Script" that runs 1000 steps of the emulator, then quits.
1k.jzintv-script:
	echo "x" > $@
	for i in $$(seq 1 1000); do echo "s"; done >> $@
	echo "q" >> $@

%.bin %.cfg: %.asm
	as1600 -o $@ $<

%.jzintv.txt: %.bin %.cfg 1k.jzintv-script
	jzintv -d $< --script=1k.jzintv-script | sed 's/^[ \t]*//' | grep -E "^([0-9A-F]{4})|RD|WR" > $@

.INTERMEDIATE: 1k.jzintv-script

clean:
	rm -f $(BINS) $(CFGS) $(LOGS)

.PHONY: all clean
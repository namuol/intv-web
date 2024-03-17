# INTV JS

An Intellivision emulator for the web.

## Why?

There might be an INTV emulator for the web out there already, but I couldn't
find one easily.

I'd also like to implement a higher performance emulator for embedded/low-power
devices, so this implementation can serve as a reference for a port to a
lower-level language some day, I hope.

## Dependencies

The following files are omitted from this repo to avoid copyright infringement,
but are required to run tests:

- `exec.bin` - Intellivision Executive ROM (BIOS)
  - MD5: `62e761035cb657903761800f4437b8af`
- `grom.bin` - Intellivision Graphics ROM
  - MD5: `0cd5946c6473e42e8e4c2137785e427f`

## Credits

Special thanks to [Dan Grise](https://www.youtube.com/@dangrise6182), for
inspiring this project with his [FPGA-driven
INTV](https://www.youtube.com/watch?v=3CrwzyJIzMI) project.
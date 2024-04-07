# Test ROMs

Handwritten ROMs made to test various aspects of the emulator, as well as jzIntv
debug output which we use in our tests to validate behavior.

## Dependencies

You will need the following from SDK-1600 in your `$PATH` in order to produce
the required ROMs and their output logs.

- `as1600` (assembler, builds ROMs)
- `jzintv` (emulator, generates output logs)

## Building

```
make
```

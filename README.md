# INTV-WEB

An Intellivision emulator for the web.

## Status

Nonfunctional. Just getting the basic boilerplate going.

## Why?

There might be an INTV emulator for the web out there already, but I couldn't find
one easily.

> Edit: Actually it looks like the MAME emulator runs on archive.org right in
> the browser; cool!

I'd also like to implement a higher performance emulator for embedded/low-power
devices, so this implementation can serve as a reference for a port to a
lower-level language some day, I hope.

Mainly I just wanted to do this as an exercise, so if you want a fast, accurate,
and user-friendly emulator, you may want to look elsewhere.

## Dependencies

The following files are omitted from this repo to avoid copyright infringement,
but are required to run tests:

```
2e72a9a2b897d330a35c8b07a6146c52 roms/ecs.bin
62e761035cb657903761800f4437b8af roms/exec.bin
0cd5946c6473e42e8e4c2137785e427f roms/grom.bin
d5530f74681ec6e0f282dab42e6b1c5f roms/ivoice.bin
```

## Credits

### Inspiration

Special thanks to [Dan Grise](https://www.youtube.com/@dangrise6182), for
inspiring this project with his [FPGA-driven
INTV](https://www.youtube.com/watch?v=3CrwzyJIzMI) project.

### Test data

While I'm aiming to implement this emulator as a kind of exercise in "clean
room" implementation by referencing General Instrument documentation on the
CP1600 CPU and the other peripherals used in the Intellivision series of
consoles, it's impossible to verify the accuracy of the emulator without real
hardware.

So in lieu of real INTV hardware (and a logic analyzer 💸) I've enlisted the
help of the phenomenal [jzIntv](http://spatula-city.org/~im14u2c/intv) emulator
by Joe Zbiciak to provide some test fixtures to jump-start my development
process.

In other words, this project may not really be feasible for me without the hard
work of Joe Zbiciak and many others who have contributed to jzIntv. Thank you!

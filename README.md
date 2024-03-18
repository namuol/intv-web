# INTV-WEB

An Intellivision emulator for the web.

## Status

Nonfunctional. Just getting the basic boilerplate going.

## Why?

There might be an INTV emulator for the web out there already, but I couldn't
find one easily.

I'd also like to implement a higher performance emulator for embedded/low-power
devices, so this implementation can serve as a reference for a port to a
lower-level language some day, I hope.

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

Special thanks to [Dan Grise](https://www.youtube.com/@dangrise6182), for
inspiring this project with his [FPGA-driven
INTV](https://www.youtube.com/watch?v=3CrwzyJIzMI) project.
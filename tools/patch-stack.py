#!/usr/bin/env python3
"""Enlarge the stack of @ffmpeg/core@0.12.10 (umd/esm ffmpeg-core.wasm) by 1 MiB.

usage: patch-stack.py <in.wasm> <out.wasm>
The stock 64 KB stack overflows in libopus stereo encoding (complexity >= 5).
Moves the initial stack pointer (global 0) and the sbrk heap base (data word
at memory 6077460) from 14608160 to 15656736.
"""
import struct, sys

OLD = 14608160
NEW = OLD + (1 << 20)

def leb(v):
    out = bytearray()
    while True:
        x = v & 0x7F
        v >>= 7
        if v == 0 and not x & 0x40:
            out.append(x)
            return bytes(out)
        out.append(x | 0x80)

b = bytearray(open(sys.argv[1], 'rb').read())
assert b.count(leb(OLD)) == 1 and len(leb(NEW)) == len(leb(OLD)), 'unexpected build'
i = b.find(leb(OLD))
b[i:i + 4] = leb(NEW)
old3 = struct.pack('<I', OLD)[:3]          # final data segment drops the trailing zero byte
assert b.count(old3) >= 1
j = b.rfind(old3)
b[j:j + 3] = struct.pack('<I', NEW)[:3]
open(sys.argv[2], 'wb').write(b)
print('patched stack pointer at', i, 'and heap base at', j)

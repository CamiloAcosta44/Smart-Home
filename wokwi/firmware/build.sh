#!/bin/sh
# Compila firmware.ino para Arduino Mega 2560 con el avr-gcc que ya instalo el Arduino IDE.
# ponytail: build manual sin arduino-cli; si se instala arduino-cli, reemplazar por
#   arduino-cli compile -b arduino:avr:mega --output-dir build .
set -e
cd "$(dirname "$0")"
A=$HOME/.arduino15/packages/arduino
BIN=$A/tools/avr-gcc/7.3.0-atmel3.6.1-arduino7/bin
CORE=$A/hardware/avr/1.8.8/cores/arduino
VAR=$A/hardware/avr/1.8.8/variants/mega
LIB=$HOME/.arduino15/libraries/Servo/src
OUT=build
FLAGS="-c -Os -w -ffunction-sections -fdata-sections -mmcu=atmega2560 -DF_CPU=16000000L -DARDUINO=10819 -DARDUINO_AVR_MEGA2560 -DARDUINO_ARCH_AVR -I$CORE -I$VAR -I$LIB -MMD -flto"
mkdir -p $OUT/core
for f in $CORE/*.c;   do $BIN/avr-gcc $FLAGS -std=gnu11 "$f" -o $OUT/core/$(basename "$f").o; done
for f in $CORE/*.cpp; do $BIN/avr-g++ $FLAGS -std=gnu++11 -fpermissive -fno-exceptions -fno-threadsafe-statics "$f" -o $OUT/core/$(basename "$f").o; done
for f in $CORE/*.S;   do $BIN/avr-gcc $FLAGS -x assembler-with-cpp "$f" -o $OUT/core/$(basename "$f").o; done
$BIN/avr-g++ $FLAGS -std=gnu++11 -fno-exceptions -fno-threadsafe-statics $LIB/avr/Servo.cpp -o $OUT/core/Servo.cpp.o
{ echo '#include <Arduino.h>'; cat firmware.ino; } > $OUT/firmware.cpp
$BIN/avr-g++ $FLAGS -std=gnu++11 -fno-exceptions -fno-threadsafe-statics $OUT/firmware.cpp -o $OUT/firmware.o
$BIN/avr-gcc -w -Os -flto -fuse-linker-plugin -Wl,--gc-sections -mmcu=atmega2560 -o $OUT/firmware.elf $OUT/firmware.o $OUT/core/*.o -lm
$BIN/avr-objcopy -O ihex -R .eeprom $OUT/firmware.elf $OUT/firmware.hex
$BIN/avr-size $OUT/firmware.elf

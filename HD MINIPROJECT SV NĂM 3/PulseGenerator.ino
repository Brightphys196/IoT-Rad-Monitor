#include <Arduino.h>

// Pin configuration
const int outputPin = 13;

  // Specify the pulse parameters
  unsigned long frequency = 1000; // Frequency in Hz
  unsigned long period = 1 / frequency; // Period in seconds
  unsigned long pulseWidth = 50; // Pulse width in milliseconds
  unsigned long pulseDelay = 100; // Pulse delay in milliseconds

// Function to generate a pulse
void generatePulse(unsigned long frequency, unsigned long period, unsigned long pulseWidth, unsigned long pulseDelay) {
  // Calculate the number of pulses per second
  unsigned long pulsesPerSecond = frequency * 2;
 
    // Generate pulses
    for (unsigned long i = 0; i < pulsesPerSecond; i++) {
      digitalWrite(outputPin, HIGH);
      delayMicroseconds(pulseWidth);
      digitalWrite(outputPin, LOW);
      delayMicroseconds(pulseDelay);
    }

}

void setup() {
  // Set the output pin
  pinMode(outputPin, OUTPUT);
  
}

void loop() {
  // Generate the pulse
  generatePulse(frequency, period, pulseWidth, pulseDelay);
}

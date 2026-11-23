#include <Servo.h>

// Casa Inteligente - firmware del Arduino (Uno o Mega) (capa de hardware).
// Solo lee sensores y ejecuta comandos: las reglas viven en el backend
// (ControladorAutomatizacion). Protocolo serial por lineas, 115200 baudios:
//   Arduino -> PC:  EVT luz <lux> | EVT mov <0|1> | OK led <0|1> | OK cortina <0-100>
//   PC -> Arduino:  CMD led <0|1> | CMD cortina <0-100>

const uint8_t PIN_PIR = 2;     // SensorMovimiento
const uint8_t PIN_BTN_MOV = 3; // Solo pruebas: boton que simula movimiento (en Wokwi el PIR no se automatiza)
const uint8_t PIN_LUZ = A0;    // SensorLuz (AO del modulo fotoresistencia)
const uint8_t PIN_LED = 7;     // LED
const uint8_t PIN_SERVO = 9;   // Servomotor de la Cortina

// Curva de la fotoresistencia del modulo de Wokwi (valores de su documentacion).
// ponytail: calibrar GAMMA/RL10 con el LDR real del montaje fisico.
const float GAMMA = 0.7, RL10 = 50;

// Cortina automatica: por encima de LUX_UMBRAL se abre, por debajo se cierra.
const float LUX_UMBRAL = 300;

const unsigned long PERIODO_LUZ_MS = 1000;
unsigned long ultimaLuz = 0;
int ultimoMov = -1;
String linea;

// Servo: libreria Servo (funciona en Uno y en Mega).
Servo servo;
void servoInit() { servo.attach(PIN_SERVO); }
void servoGrados(int g) { servo.write(constrain(g, 0, 180)); }

// Cortina: 0% = cerrada (0 grados), 100% = abierta (90 grados).
void cortina(int pct) {
  pct = constrain(pct, 0, 100);
  servoGrados(pct * 90 / 100);
  Serial.print(F("OK cortina ")); Serial.println(pct);
}

void led(int v) {
  digitalWrite(PIN_LED, v ? HIGH : LOW);
  Serial.print(F("OK led ")); Serial.println(v ? 1 : 0);
}

float leerLux() {
  float v = analogRead(PIN_LUZ) / 1024.0 * 5;
  if (v >= 4.99) return 0;  // oscuridad total
  float r = 2000 * v / (1 - v / 5);
  return pow(RL10 * 1e3 * pow(10, GAMMA) / r, 1 / GAMMA);
}

void procesar(String s) {
  s.trim();
  if (!s.startsWith(F("CMD "))) return;
  int esp = s.indexOf(' ', 4);
  if (esp < 0) return;
  String disp = s.substring(4, esp);
  int valor = s.substring(esp + 1).toInt();
  if (disp == F("led")) led(valor);
  else if (disp == F("cortina")) cortina(valor);
  else { Serial.print(F("ERR ")); Serial.println(disp); }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_PIR, INPUT);
  pinMode(PIN_BTN_MOV, INPUT_PULLUP);  // sin boton conectado queda en HIGH = sin efecto
  pinMode(PIN_LED, OUTPUT);
  servoInit();
  cortina(100);
  led(0);
  Serial.println(F("LISTO"));
}

void loop() {
  // Antirrebote: solo se reporta un cambio que se mantiene estable 50 ms.
  static int crudo = -1;
  static unsigned long desde = 0;
  int mov = digitalRead(PIN_PIR) || !digitalRead(PIN_BTN_MOV);
  if (mov != crudo) { crudo = mov; desde = millis(); }
  if (mov != ultimoMov && millis() - desde >= 50) {
    ultimoMov = mov;
    Serial.print(F("EVT mov ")); Serial.println(mov);
  }
  if (millis() - ultimaLuz >= PERIODO_LUZ_MS) {
    ultimaLuz = millis();
    float lux = leerLux();
    Serial.print(F("EVT luz ")); Serial.println((long)lux);
    static int auto_ = -1;  // ultima accion automatica: 0 cerrada, 100 abierta
    int destino = lux > LUX_UMBRAL ? 100 : 0;
    if (destino != auto_) { auto_ = destino; cortina(destino); }
  }
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') { if (linea.length()) procesar(linea); linea = ""; }
    else if (linea.length() < 40) linea += c;
  }
}
#include "logger.h"

void Logger_Iniciar() {
    Serial.begin(SERIAL_BAUD);
    while (!Serial) {
        delay(10);
    }
    Serial.println("\n========================================");
    Serial.println("CENTINELA v5.0 - Iniciando...");
    Serial.println("======================================\n");
}

void Logger_Imprimir(const char* modulo, const char* mensaje) {
    if (DEBUG_MODE) {
        Serial.print("[");
        Serial.print(modulo);
        Serial.print("] ");
        Serial.println(mensaje);
    }
}

void Logger_ImprimirValor(const char* modulo, const char* etiqueta, int valor) {
    if (DEBUG_MODE) {
        Serial.print("[");
        Serial.print(modulo);
        Serial.print("] ");
        Serial.print(etiqueta);
        Serial.print(": ");
        Serial.println(valor);
    }
}

void Logger_ImprimirValorFloat(const char* modulo, const char* etiqueta, float valor) {
    if (DEBUG_MODE) {
        Serial.print("[");
        Serial.print(modulo);
        Serial.print("] ");
        Serial.print(etiqueta);
        Serial.print(": ");
        Serial.println(valor, 2);
    }
}

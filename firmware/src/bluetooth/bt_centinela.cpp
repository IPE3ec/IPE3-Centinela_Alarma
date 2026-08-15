#include "bt_centinela.h"
#include "protocolo.h"
#include "logger.h"

void Bluetooth_Iniciar() {
    Protocolo_Iniciar();
    Logger_Imprimir("BT", "Bluetooth inicializado (placeholder)");
}

void Bluetooth_Actualizar() {
    Protocolo_Actualizar();
}

void Bluetooth_Enviar(const char* datos) {
    Serial.print("[BT] ");
    Serial.println(datos);
}

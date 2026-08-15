#include <Arduino.h>
#include "pinout.h"
#include "config.h"
#include "estados.h"
#include "comandos.h"
#include "logger.h"
#include "temporizadores.h"
#include "leds.h"
#include "rele.h"
#include "sirena.h"
#include "sistema.h"
#include "maquina_estados.h"
#include "sensores.h"
#include "energia.h"
#include "sabotaje.h"
#include "protocolo.h"
#include "bt_centinela.h"

void setup() {
    Logger_Iniciar();
    LEDS_Iniciar();
    Sirena_Iniciar();
    Rele_Iniciar();
    Sensores_Iniciar();
    Energia_Iniciar();
    Sabotaje_Iniciar();
    Bluetooth_Iniciar();
    MaquinaEstados_Iniciar();

    Serial.println("Sistema inicializado correctamente");
}

void loop() {
    Bluetooth_Actualizar();
    Sensores_Actualizar();
    Energia_Actualizar();
    Sabotaje_Actualizar();
    MaquinaEstados_Actualizar();
    Sistema_Actualizar();

    delay(10);
}

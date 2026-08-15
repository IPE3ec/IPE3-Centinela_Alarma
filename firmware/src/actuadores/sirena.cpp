#include "sirena.h"

static bool sirenaActiva = false;
static Temporizador temporizadorSirena;

void Sirena_Iniciar() {
    pinMode(PIN_SIRENA, OUTPUT);
    digitalWrite(PIN_SIRENA, LOW);
    sirenaActiva = false;
    temporizadorSirena = Temporizador_Crear(ALARM_TIMEOUT);
}

void Sirena_Actualizar() {
    if (sirenaActiva) {
        if (Temporizador_Verificar(&temporizadorSirena)) {
            Sirena_Apagar();
        }
    }
}

void Sirena_Activar() {
    sirenaActiva = true;
    digitalWrite(PIN_SIRENA, HIGH);
    Temporizador_Iniciar(&temporizadorSirena);
}

void Sirena_Apagar() {
    sirenaActiva = false;
    digitalWrite(PIN_SIRENA, LOW);
}

bool Sirena_EstaActiva() {
    return sirenaActiva;
}

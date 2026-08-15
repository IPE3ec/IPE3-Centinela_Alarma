#include "rele.h"

static bool releArranque = false;
static bool releAcc = false;
static bool releIgn = false;

void Rele_Iniciar() {
    pinMode(PIN_RELE_ARRANQUE, OUTPUT);
    pinMode(PIN_RELE_ACC, OUTPUT);
    pinMode(PIN_RELE_IGN, OUTPUT);

    digitalWrite(PIN_RELE_ARRANQUE, LOW);
    digitalWrite(PIN_RELE_ACC, LOW);
    digitalWrite(PIN_RELE_IGN, LOW);

    releArranque = false;
    releAcc = false;
    releIgn = false;
}

void Rele_Actualizar() {
}

void Rele_SetAcc(bool estado) {
    releAcc = estado;
    digitalWrite(PIN_RELE_ACC, estado ? HIGH : LOW);
}

void Rele_SetIgn(bool estado) {
    releIgn = estado;
    digitalWrite(PIN_RELE_IGN, estado ? HIGH : LOW);
}

void Rele_SetArranque(bool estado) {
    releArranque = estado;
    digitalWrite(PIN_RELE_ARRANQUE, estado ? HIGH : LOW);
}

bool Rele_GetAcc() {
    return releAcc;
}

bool Rele_GetIgn() {
    return releIgn;
}

bool Rele_GetArranque() {
    return releArranque;
}

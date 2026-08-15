#ifndef SIRENA_H
#define SIRENA_H

#include <Arduino.h>
#include "pinout.h"
#include "temporizadores.h"
#include "config.h"

void Sirena_Iniciar();
void Sirena_Actualizar();
void Sirena_Activar();
void Sirena_Apagar();
bool Sirena_EstaActiva();

#endif

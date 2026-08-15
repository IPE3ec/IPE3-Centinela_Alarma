#ifndef ENERGIA_H
#define ENERGIA_H

#include <Arduino.h>
#include "pinout.h"
#include "config.h"

void Energia_Iniciar();
void Energia_Actualizar();
float Energia_ObtenerVoltaje();
bool Energia_EsCritico();

#endif

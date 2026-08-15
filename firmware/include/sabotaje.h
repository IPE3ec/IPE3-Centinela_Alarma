#ifndef SABOTAJE_H
#define SABOTAJE_H

#include <Arduino.h>
#include "pinout.h"
#include "config.h"

void Sabotaje_Iniciar();
void Sabotaje_Actualizar();
bool Sabotaje_Detectado();

#endif

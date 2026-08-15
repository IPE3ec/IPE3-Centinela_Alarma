#ifndef SENSORES_H
#define SENSORES_H

#include <Arduino.h>
#include "pinout.h"
#include "estados.h"

void Sensores_Iniciar();
void Sensores_Actualizar();
bool Sensores_PuertaAbierta();
bool Sensores_Impacto();
float Sensores_ObtenerVoltaje();

#endif

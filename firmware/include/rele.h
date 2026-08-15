#ifndef RELE_H
#define RELE_H

#include <Arduino.h>
#include "pinout.h"

void Rele_Iniciar();
void Rele_Actualizar();
void Rele_SetAcc(bool estado);
void Rele_SetIgn(bool estado);
void Rele_SetArranque(bool estado);
bool Rele_GetAcc();
bool Rele_GetIgn();
bool Rele_GetArranque();

#endif

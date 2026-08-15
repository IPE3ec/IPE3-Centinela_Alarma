#ifndef PROTOCOLO_H
#define PROTOCOLO_H

#include <Arduino.h>
#include "comandos.h"

void Protocolo_Iniciar();
void Protocolo_Actualizar();
void Protocolo_ProcesarComando(const char* comando);
const char* Protocolo_ObtenerRespuesta();

#endif

#ifndef SISTEMA_H
#define SISTEMA_H

#include "estados.h"

void Sistema_Iniciar();
void Sistema_Actualizar();
EstadoSistema Sistema_ObtenerEstado();
void Sistema_SetEstado(EstadoSistema nuevoEstado);

#endif

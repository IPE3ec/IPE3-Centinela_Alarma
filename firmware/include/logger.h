#ifndef LOGGER_H
#define LOGGER_H

#include "config.h"

void Logger_Iniciar();
void Logger_Imprimir(const char* modulo, const char* mensaje);
void Logger_ImprimirValor(const char* modulo, const char* etiqueta, int valor);
void Logger_ImprimirValorFloat(const char* modulo, const char* etiqueta, float valor);

#endif

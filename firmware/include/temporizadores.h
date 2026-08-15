#ifndef TEMPORIZADORES_H
#define TEMPORIZADORES_H

#include <stdint.h>
#include <stdbool.h>

typedef struct {
    unsigned long intervalo;
    unsigned long ultimaActivacion;
    bool activo;
} Temporizador;

Temporizador Temporizador_Crear(unsigned long intervalo);
void Temporizador_Iniciar(Temporizador* t);
void Temporizador_Reiniciar(Temporizador* t);
bool Temporizador_Verificar(Temporizador* t);
void Temporizador_Detener(Temporizador* t);

#endif

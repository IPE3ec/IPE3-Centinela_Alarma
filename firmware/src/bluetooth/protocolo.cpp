#include "protocolo.h"
#include "comandos.h"
#include "logger.h"

static char bufferComando[64];
static uint8_t indiceBuffer = 0;
static char respuesta[32];

void Protocolo_Iniciar() {
    indiceBuffer = 0;
    memset(bufferComando, 0, sizeof(bufferComando));
    memset(respuesta, 0, sizeof(respuesta));
    Logger_Imprimir("PROTOCOLO", "Inicializado");
}

void Protocolo_Actualizar() {
}

void Protocolo_ProcesarComando(const char* comando) {
    strncpy(bufferComando, comando, sizeof(bufferComando) - 1);
    bufferComando[sizeof(bufferComando) - 1] = '\0';

    if (strcmp(bufferComando, CMD_ARM) == 0) {
        strcpy(respuesta, RESP_OK);
    } else if (strcmp(bufferComando, CMD_DISARM) == 0) {
        strcpy(respuesta, RESP_OK);
    } else if (strcmp(bufferComando, CMD_LOCK) == 0) {
        strcpy(respuesta, RESP_OK);
    } else if (strcmp(bufferComando, CMD_UNLOCK) == 0) {
        strcpy(respuesta, RESP_OK);
    } else if (strcmp(bufferComando, CMD_START) == 0) {
        strcpy(respuesta, RESP_OK);
    } else if (strcmp(bufferComando, CMD_STOP) == 0) {
        strcpy(respuesta, RESP_OK);
    } else if (strcmp(bufferComando, CMD_HORN) == 0) {
        strcpy(respuesta, RESP_OK);
    } else if (strcmp(bufferComando, CMD_STATUS) == 0) {
        strcpy(respuesta, "ESTADO:");
    } else if (strcmp(bufferComando, CMD_GETMAC) == 0) {
        strcpy(respuesta, RESP_MAC);
    } else if (strcmp(bufferComando, CMD_FORGET_ALL) == 0) {
        strcpy(respuesta, RESP_OK);
    } else {
        strcpy(respuesta, RESP_ERROR);
    }

    Logger_ImprimirValor("PROTOCOLO", "CMD", comando);
    Logger_ImprimirValor("PROTOCOLO", "RESP", respuesta);
}

const char* Protocolo_ObtenerRespuesta() {
    return respuesta;
}

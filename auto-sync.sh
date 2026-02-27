#!/bin/bash

LOG_FILE="/root/projects/fitness-dashboard/sync.log"
API_URL="http://157.254.174.220:3001/api/strava/fetch-details"

echo "🚀 Iniciando auto-sync de detalles" | tee -a $LOG_FILE
echo "📅 $(date)" | tee -a $LOG_FILE
echo "================================" | tee -a $LOG_FILE

sync_count=0
max_syncs=15

while [ $sync_count -lt $max_syncs ]; do
    sync_count=$((sync_count + 1))
    
    echo "" | tee -a $LOG_FILE
    echo "🔄 Sync #$sync_count - $(date)" | tee -a $LOG_FILE
    
    # Ejecutar fetch-details
    response=$(curl -s -X POST "$API_URL" 2>&1)
    
    echo "📥 Respuesta: $response" | tee -a $LOG_FILE
    
    # Verificar si quedan actividades
    remaining=$(echo "$response" | grep -o '"remaining":[0-9]*' | grep -o '[0-9]*')
    
    if [ "$remaining" = "0" ]; then
        echo "✅ ¡Todas las actividades tienen detalles!" | tee -a $LOG_FILE
        break
    fi
    
    echo "📊 Faltan: $remaining actividades" | tee -a $LOG_FILE
    
    # Esperar 16 minutos
    echo "⏳ Esperando 16 minutos..." | tee -a $LOG_FILE
    sleep 960
done

echo "" | tee -a $LOG_FILE
echo "🏁 Auto-sync finalizado - $(date)" | tee -a $LOG_FILE

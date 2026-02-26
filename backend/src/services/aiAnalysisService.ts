import Groq from 'groq-sdk';

interface CategoryStats {
  count: number;
  totalDistance: number;
  totalDuration: number;
  avgHR: number;
  avgPace: number;
  totalCalories: number;
}

interface ActivitySummary {
  period: string;
  periodLabel: string;
  totalActivities: number;
  running: CategoryStats;
  strength: CategoryStats;
  cycling: CategoryStats;
  weeklyAverage: {
    runningSessions: number;
    runningKm: number;
    strengthSessions: number;
  };
  trend: string;
}

export class AIAnalysisService {
  private groq: Groq | null = null;

  constructor() {
    if (process.env.GROQ_API_KEY) {
      this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    }
  }

  private getPeriodLabel(period: string): string {
    const labels: Record<string, string> = {
      '1w': 'esta semana (lunes a hoy)',
      '1m': 'últimas 4 semanas',
      '3m': 'últimas 12 semanas',
      '6m': 'últimas 26 semanas',
      '1y': 'últimas 52 semanas',
      '3y': 'últimos 3 años',
      'all': 'todo el historial',
    };
    return labels[period] || 'período seleccionado';
  }

  private getPeriodContext(period: string): string {
    const contexts: Record<string, string> = {
      '1w': 'Esta es una vista de corto plazo (microciclo). Enfócate en la recuperación, fatiga reciente y si hay signos de sobreentrenamiento. Una semana no es suficiente para evaluar progreso, pero sí para ver el estado actual.',
      '1m': 'Un mes (4 semanas) permite ver patrones de entrenamiento. Analiza consistencia, progresión de volumen, balance running/fuerza y si hay semanas de carga/descarga apropiadas.',
      '3m': 'Tres meses es un mesociclo típico. Busca patrones de periodización, adaptaciones al entrenamiento, progresión en ritmos y si el volumen ha aumentado gradualmente.',
      '6m': 'Medio año muestra tendencias claras de preparación. Analiza si hay mejoras en ritmo, resistencia, consistencia general y preparación para objetivos.',
      '1y': 'Un año completo permite ver estacionalidad, picos de forma, períodos de mayor/menor actividad y ciclos completos de preparación.',
      '3y': 'Visión de largo plazo. Analiza la evolución general como corredor, mejoras significativas en tiempos, aumento de distancias y madurez atlética.',
      'all': 'Historial completo. Proporciona una visión general de toda la trayectoria deportiva del atleta.',
    };
    return contexts[period] || '';
  }

  private getWeeksInPeriod(period: string): number {
    const weeks: Record<string, number> = {
      '1w': 1,
      '1m': 4,
      '3m': 12,
      '6m': 26,
      '1y': 52,
      '3y': 156,
      'all': 52,
    };
    return weeks[period] || 4;
  }

  async getFitnessStatus(activities: any[], period: string, goals: any[]): Promise<any> {
    const summary = this.createDetailedSummary(activities, period);
    
    if (!this.groq) {
      return this.getOfflineFitnessStatus(summary, goals);
    }

    const goalsText = goals.length > 0 
      ? `\n\nOBJETIVOS DEL ATLETA:\n${goals.map(g => {
          const daysUntil = Math.ceil((new Date(g.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          return `- ${g.type === 'primary' ? '🎯 PRINCIPAL' : '📌 Intermedio'}: ${g.name} (${g.raceType || 'carrera'}) - ${new Date(g.targetDate).toLocaleDateString('es-ES')} (en ${daysUntil} días)${g.targetTime ? ` - Objetivo: ${g.targetTime}` : ''}${g.distance ? ` - ${(g.distance/1000).toFixed(0)}km` : ''}`;
        }).join('\n')}`
      : '';

    const prompt = `Eres un coach de running experto. Analiza el estado de fitness para ${summary.periodLabel}.

CONTEXTO DEL PERÍODO: ${this.getPeriodContext(period)}

DATOS DE RUNNING (${summary.periodLabel}):
- Sesiones: ${summary.running.count}
- Distancia total: ${(summary.running.totalDistance / 1000).toFixed(1)} km
- Tiempo total: ${(summary.running.totalDuration / 3600).toFixed(1)} horas
- Ritmo promedio: ${summary.running.avgPace > 0 ? summary.running.avgPace.toFixed(2) : 'N/A'} min/km
- FC promedio: ${summary.running.avgHR || 'N/A'} bpm
- Promedio semanal: ${summary.weeklyAverage.runningKm.toFixed(1)} km/semana, ${summary.weeklyAverage.runningSessions.toFixed(1)} sesiones/semana

DATOS DE FUERZA (${summary.periodLabel}):
- Sesiones: ${summary.strength.count}
- Tiempo total: ${(summary.strength.totalDuration / 3600).toFixed(1)} horas
- Promedio semanal: ${summary.weeklyAverage.strengthSessions.toFixed(1)} sesiones/semana

TENDENCIA RECIENTE: ${summary.trend === 'improving' ? 'Mejorando 📈' : summary.trend === 'declining' ? 'Bajando 📉' : summary.trend === 'stable' ? 'Estable ➡️' : 'Datos insuficientes'}
${goalsText}

Responde en español con este formato EXACTO y sé MUY ESPECÍFICO para el período ${summary.periodLabel}:

🏃 **Estado Cardio (${summary.periodLabel}):** [Evaluación específica del volumen y calidad para este período. Menciona números concretos.]

💪 **Estado Fuerza:** [Evaluación del trabajo complementario de fuerza]

📊 **Nivel actual:** [Basado en los promedios semanales: ${summary.weeklyAverage.runningKm.toFixed(1)}km/semana]
${goals.length > 0 ? '\n🎯 **Preparación para objetivos:** [Evalúa específicamente si el entrenamiento actual es adecuado para las carreras objetivo, considerando las fechas y distancias]' : ''}

💡 **Acción recomendada:** [UNA acción concreta y específica para los próximos días]`;

    try {
      const response = await this.groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 700,
      });

      return {
        status: response.choices[0]?.message?.content || 'No disponible',
        stats: summary,
      };
    } catch (error) {
      console.error('Groq Error:', error);
      return this.getOfflineFitnessStatus(summary, goals);
    }
  }

  private getOfflineFitnessStatus(summary: ActivitySummary, goals: any[]): any {
    let status = `🏃 **Estado Cardio (${summary.periodLabel}):** `;
    
    if (summary.running.count === 0) {
      status += `Sin actividades de running en este período.\n\n`;
    } else {
      status += `${summary.running.count} sesiones, ${(summary.running.totalDistance / 1000).toFixed(1)} km totales. Promedio: ${summary.weeklyAverage.runningKm.toFixed(1)} km/semana.\n\n`;
    }

    status += `💪 **Estado Fuerza:** ${summary.strength.count} sesiones (${summary.weeklyAverage.strengthSessions.toFixed(1)}/semana).\n\n`;
    status += `📊 **Nivel:** Configura GROQ_API_KEY para análisis detallado con IA.`;

    if (goals.length > 0) {
      status += `\n\n🎯 **Próximos objetivos:** ${goals.map(g => g.name).join(', ')}`;
    }

    return { status, stats: summary };
  }

  async analyzeActivities(activities: any[], userQuestion: string | undefined, period: string, goals: any[]): Promise<string> {
    if (!this.groq) {
      return this.getOfflineAnalysis(activities, period);
    }

    const summary = this.createDetailedSummary(activities, period);
    
    const goalsText = goals.length > 0 
      ? `\n\nOBJETIVOS DE CARRERAS DEL ATLETA:\n${goals.map(g => {
          const daysUntil = Math.ceil((new Date(g.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          return `- ${g.type === 'primary' ? 'OBJETIVO PRINCIPAL' : 'Objetivo intermedio'}: ${g.name} - ${new Date(g.targetDate).toLocaleDateString('es-ES')} (faltan ${daysUntil} días)${g.distance ? ` - Distancia: ${(g.distance/1000).toFixed(0)}km` : ''}${g.targetTime ? ` - Tiempo objetivo: ${g.targetTime}` : ''}${g.notes ? ` - Notas: ${g.notes}` : ''}`;
        }).join('\n')}`
      : '';

    const systemPrompt = `Eres un entrenador de running experto con experiencia en preparación de carreras populares, maratones y trail running.

PERÍODO DE ANÁLISIS: ${summary.periodLabel}
CONTEXTO: ${this.getPeriodContext(period)}

REGLAS IMPORTANTES:
1. SEPARA SIEMPRE el análisis de RUNNING del de FUERZA - son complementarios pero diferentes
2. Para RUNNING analiza: volumen semanal, consistencia, ritmos, frecuencia cardíaca, progresión
3. Para FUERZA analiza: frecuencia semanal, si es suficiente como complemento al running
4. NO mezcles métricas (no incluyas sesiones de fuerza en cálculos de distancia/ritmo)
5. Considera el contexto del período:
   - 1 semana: microciclo, enfócate en recuperación y estado actual
   - 1-3 meses: mesociclo, busca patrones de carga/descarga
   - 6+ meses: macrociclo, evalúa progresión general
6. Si hay objetivos de carrera, evalúa específicamente la preparación
7. Sé específico con números y porcentajes
8. Usa emojis para hacer el mensaje más visual`;

    const userPrompt = userQuestion 
      ? `DATOS DE ENTRENAMIENTO (${summary.periodLabel}):

RUNNING:
- Total sesiones: ${summary.running.count}
- Distancia total: ${(summary.running.totalDistance / 1000).toFixed(1)} km
- Tiempo total: ${(summary.running.totalDuration / 3600).toFixed(1)} horas
- Ritmo promedio: ${summary.running.avgPace > 0 ? summary.running.avgPace.toFixed(2) : 'N/A'} min/km
- FC promedio: ${summary.running.avgHR || 'N/A'} bpm
- Promedio semanal: ${summary.weeklyAverage.runningKm.toFixed(1)} km, ${summary.weeklyAverage.runningSessions.toFixed(1)} sesiones

FUERZA:
- Total sesiones: ${summary.strength.count}
- Tiempo total: ${(summary.strength.totalDuration / 3600).toFixed(1)} horas
- Promedio semanal: ${summary.weeklyAverage.strengthSessions.toFixed(1)} sesiones

TENDENCIA: ${summary.trend}
${goalsText}

PREGUNTA DEL ATLETA: ${userQuestion}`
      : `Realiza un análisis completo del entrenamiento de ${summary.periodLabel}:

RUNNING:
- Total sesiones: ${summary.running.count}
- Distancia total: ${(summary.running.totalDistance / 1000).toFixed(1)} km
- Tiempo total: ${(summary.running.totalDuration / 3600).toFixed(1)} horas
- Ritmo promedio: ${summary.running.avgPace > 0 ? summary.running.avgPace.toFixed(2) : 'N/A'} min/km
- FC promedio: ${summary.running.avgHR || 'N/A'} bpm
- Promedio semanal: ${summary.weeklyAverage.runningKm.toFixed(1)} km, ${summary.weeklyAverage.runningSessions.toFixed(1)} sesiones

FUERZA:
- Total sesiones: ${summary.strength.count}
- Tiempo total: ${(summary.strength.totalDuration / 3600).toFixed(1)} horas
- Promedio semanal: ${summary.weeklyAverage.strengthSessions.toFixed(1)} sesiones

TENDENCIA: ${summary.trend}
${goalsText}

Proporciona un análisis detallado separando running y fuerza, evaluando si el volumen es apropiado para el período y los objetivos.`;

    try {
      const response = await this.groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 1500,
      });

      return response.choices[0]?.message?.content || 'No pude generar análisis';
    } catch (error) {
      console.error('Groq Error:', error);
      return this.getOfflineAnalysis(activities, period);
    }
  }

  private getOfflineAnalysis(activities: any[], period: string): string {
    const summary = this.createDetailedSummary(activities, period);
    
    let analysis = `📊 **Resumen de Entrenamiento - ${summary.periodLabel}**\n\n`;
    
    analysis += `🏃 **RUNNING:**\n`;
    analysis += `- Sesiones totales: ${summary.running.count}\n`;
    analysis += `- Distancia total: ${(summary.running.totalDistance / 1000).toFixed(1)} km\n`;
    analysis += `- Tiempo total: ${(summary.running.totalDuration / 3600).toFixed(1)} horas\n`;
    analysis += `- Promedio semanal: ${summary.weeklyAverage.runningKm.toFixed(1)} km/semana\n`;
    if (summary.running.avgPace > 0) {
      analysis += `- Ritmo promedio: ${summary.running.avgPace.toFixed(2)} min/km\n`;
    }
    if (summary.running.avgHR > 0) {
      analysis += `- FC promedio: ${summary.running.avgHR} bpm\n`;
    }
    
    analysis += `\n💪 **FUERZA:**\n`;
    analysis += `- Sesiones totales: ${summary.strength.count}\n`;
    analysis += `- Tiempo total: ${(summary.strength.totalDuration / 3600).toFixed(1)} horas\n`;
    analysis += `- Promedio semanal: ${summary.weeklyAverage.strengthSessions.toFixed(1)} sesiones/semana\n`;

    analysis += `\n📈 **TENDENCIA:** ${summary.trend === 'improving' ? 'Mejorando' : summary.trend === 'declining' ? 'Bajando' : 'Estable'}\n`;

    analysis += `\n💡 *Configura GROQ_API_KEY para obtener análisis detallado con IA*`;
    
    return analysis;
  }

  async chat(message: string, activities: any[], conversationHistory: any[], period: string, goals: any[]): Promise<string> {
    if (!this.groq) {
      return this.getOfflineAnalysis(activities, period);
    }

    const summary = this.createDetailedSummary(activities, period);
    
    const goalsInfo = goals.length > 0 
      ? `\nOBJETIVOS ACTIVOS:\n${goals.map(g => {
          const daysUntil = Math.ceil((new Date(g.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          return `- ${g.type === 'primary' ? '🎯' : '📌'} ${g.name}: ${new Date(g.targetDate).toLocaleDateString('es-ES')} (${daysUntil} días)${g.distance ? ` - ${(g.distance/1000).toFixed(0)}km` : ''}`;
        }).join('\n')}`
      : 'Sin objetivos de carrera definidos.';

    const messages: any[] = [
      {
        role: 'system',
        content: `Eres un coach de running personal experto y amigable. Tu atleta te consulta sobre su entrenamiento.

DATOS DEL ATLETA (${summary.periodLabel}):

📊 RUNNING:
- Sesiones: ${summary.running.count}
- Distancia total: ${(summary.running.totalDistance/1000).toFixed(1)} km
- Ritmo promedio: ${summary.running.avgPace > 0 ? summary.running.avgPace.toFixed(2) : 'N/A'} min/km
- FC promedio: ${summary.running.avgHR || 'N/A'} bpm
- Promedio semanal: ${summary.weeklyAverage.runningKm.toFixed(1)} km, ${summary.weeklyAverage.runningSessions.toFixed(1)} sesiones

💪 FUERZA:
- Sesiones: ${summary.strength.count}
- Promedio semanal: ${summary.weeklyAverage.strengthSessions.toFixed(1)} sesiones

${goalsInfo}

CONTEXTO DEL PERÍODO: ${this.getPeriodContext(period)}

INSTRUCCIONES:
- Responde en español de forma cercana y motivadora
- Usa emojis para hacer la conversación más amena
- Sé específico y usa los datos proporcionados
- Si preguntan sobre algo que no está en los datos, indícalo honestamente
- Separa siempre el análisis de running del de fuerza
- Considera los objetivos de carrera en tus recomendaciones`
      },
      ...conversationHistory.slice(-10),
      { role: 'user', content: message }
    ];

    try {
      const response = await this.groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.7,
        max_tokens: 700,
      });

      return response.choices[0]?.message?.content || 'No pude responder';
    } catch (error) {
      console.error('Groq Chat Error:', error);
      return 'Lo siento, hubo un error al procesar tu mensaje. ¿Puedes intentar de nuevo?';
    }
  }

  private createDetailedSummary(activities: any[], period: string): ActivitySummary {
    const running = activities.filter(a => a.activityCategory === 'cardio_running');
    const strength = activities.filter(a => a.activityCategory === 'strength');
    const cycling = activities.filter(a => a.activityCategory === 'cardio_cycling');

    const weeksInPeriod = this.getWeeksInPeriod(period);

    // Para período 'all', calcular semanas reales basadas en los datos
    let actualWeeks = weeksInPeriod;
    if (period === 'all' && activities.length > 0) {
      const sortedActivities = [...activities].sort((a, b) => 
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );
      const firstActivity = new Date(sortedActivities[0].startTime);
      const lastActivity = new Date(sortedActivities[sortedActivities.length - 1].startTime);
      actualWeeks = Math.max(1, Math.ceil((lastActivity.getTime() - firstActivity.getTime()) / (7 * 24 * 60 * 60 * 1000)));
    }

    return {
      period,
      periodLabel: this.getPeriodLabel(period),
      totalActivities: activities.length,
      running: this.calculateCategoryStats(running),
      strength: this.calculateCategoryStats(strength),
      cycling: this.calculateCategoryStats(cycling),
      weeklyAverage: {
        runningSessions: running.length / actualWeeks,
        runningKm: (running.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000) / actualWeeks,
        strengthSessions: strength.length / actualWeeks,
      },
      trend: this.calculateTrend(activities),
    };
  }

  private calculateCategoryStats(activities: any[]): CategoryStats {
    if (activities.length === 0) {
      return { count: 0, totalDistance: 0, totalDuration: 0, avgHR: 0, avgPace: 0, totalCalories: 0 };
    }

    const totalDistance = activities.reduce((sum, a) => sum + (a.distance || 0), 0);
    const totalDuration = activities.reduce((sum, a) => sum + (a.duration || 0), 0);
    const totalCalories = activities.reduce((sum, a) => sum + (a.calories || 0), 0);
    
    const withHR = activities.filter(a => a.averageHR > 0);
    const avgHR = withHR.length > 0 
      ? Math.round(withHR.reduce((sum, a) => sum + a.averageHR, 0) / withHR.length)
      : 0;

    const withPace = activities.filter(a => a.averagePace > 0);
    const avgPace = withPace.length > 0
      ? withPace.reduce((sum, a) => sum + a.averagePace, 0) / withPace.length
      : 0;

    return { count: activities.length, totalDistance, totalDuration, avgHR, avgPace, totalCalories };
  }

  private calculateTrend(activities: any[]): string {
    if (activities.length < 10) return 'insufficient_data';
    
    // Comparar primera mitad con segunda mitad del período
    const midpoint = Math.floor(activities.length / 2);
    const recent = activities.slice(0, midpoint); // Más recientes primero (ordenados desc)
    const older = activities.slice(midpoint);

    const recentRunning = recent.filter(a => a.activityCategory === 'cardio_running');
    const olderRunning = older.filter(a => a.activityCategory === 'cardio_running');

    if (recentRunning.length === 0 || olderRunning.length === 0) return 'insufficient_data';

    const recentAvgDistance = recentRunning.reduce((sum, a) => sum + (a.distance || 0), 0) / recentRunning.length;
    const olderAvgDistance = olderRunning.reduce((sum, a) => sum + (a.distance || 0), 0) / olderRunning.length;

    if (recentAvgDistance > olderAvgDistance * 1.1) return 'improving';
    if (recentAvgDistance < olderAvgDistance * 0.9) return 'declining';
    return 'stable';
  }
}

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
  private ollamaUrl: string;
  private model: string;

  constructor() {
    this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.model = process.env.OLLAMA_MODEL || 'llama3.2:3b';
  }

  private async callOllama(prompt: string, systemPrompt?: string): Promise<string> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt,
          stream: false,
          options: {
            temperature: 0.7,
            num_predict: 800,
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`);
      }

      const data = await response.json();
      return data.response || 'No pude generar respuesta';
    } catch (error) {
      console.error('Ollama Error:', error);
      return '';
    }
  }

  private getPeriodLabel(period: string): string {
    const labels: Record<string, string> = {
      '1w': 'esta semana',
      '1m': 'último mes',
      '3m': 'últimos 3 meses',
      '6m': 'últimos 6 meses',
      '1y': 'último año',
      'all': 'todo el historial',
    };
    return labels[period] || 'período seleccionado';
  }

  private getWeeksInPeriod(period: string): number {
    const weeks: Record<string, number> = {
      '1w': 1,
      '1m': 4,
      '3m': 12,
      '6m': 26,
      '1y': 52,
      'all': 52,
    };
    return weeks[period] || 4;
  }

  async getFitnessStatus(activities: any[], period: string, goals: any[]): Promise<any> {
    const summary = this.createDetailedSummary(activities, period);
    
    const goalsText = goals.length > 0 
      ? `Objetivos: ${goals.map(g => `${g.name} (${new Date(g.targetDate).toLocaleDateString('es')})`).join(', ')}`
      : '';

    const prompt = `Eres un coach de running. Analiza brevemente el estado de fitness para ${summary.periodLabel}.

DATOS:
- Running: ${summary.running.count} sesiones, ${(summary.running.totalDistance / 1000).toFixed(1)} km, ritmo ${summary.running.avgPace > 0 ? summary.running.avgPace.toFixed(2) : 'N/A'} min/km
- Fuerza: ${summary.strength.count} sesiones
- Promedio semanal: ${summary.weeklyAverage.runningKm.toFixed(1)} km/semana
${goalsText}

Responde en español, máximo 4 líneas con emojis:
🏃 Estado cardio:
💪 Estado fuerza:
💡 Recomendación:`;

    const aiResponse = await this.callOllama(prompt);
    
    return {
      status: aiResponse || this.getOfflineStatus(summary),
      stats: summary,
    };
  }

  private getOfflineStatus(summary: ActivitySummary): string {
    return `🏃 Running: ${summary.running.count} sesiones, ${(summary.running.totalDistance/1000).toFixed(1)}km\n💪 Fuerza: ${summary.strength.count} sesiones\n📊 Promedio: ${summary.weeklyAverage.runningKm.toFixed(1)}km/semana`;
  }

  async analyzeActivities(activities: any[], userQuestion: string | undefined, period: string, goals: any[]): Promise<string> {
    const summary = this.createDetailedSummary(activities, period);
    
    const goalsText = goals.length > 0 
      ? `\nObjetivos: ${goals.map(g => `${g.name} el ${new Date(g.targetDate).toLocaleDateString('es')}`).join(', ')}`
      : '';

    const prompt = userQuestion 
      ? `DATOS (${summary.periodLabel}):
- Running: ${summary.running.count} sesiones, ${(summary.running.totalDistance/1000).toFixed(1)}km, ${summary.weeklyAverage.runningKm.toFixed(1)}km/semana
- Fuerza: ${summary.strength.count} sesiones
${goalsText}

Pregunta: ${userQuestion}

Responde en español como coach de running experto.`
      : `Analiza el entrenamiento de ${summary.periodLabel}:
- Running: ${summary.running.count} sesiones, ${(summary.running.totalDistance/1000).toFixed(1)}km total
- Promedio: ${summary.weeklyAverage.runningKm.toFixed(1)}km/semana, ${summary.weeklyAverage.runningSessions.toFixed(1)} sesiones/semana
- Fuerza: ${summary.strength.count} sesiones (${summary.weeklyAverage.strengthSessions.toFixed(1)}/semana)
${goalsText}

Da un análisis breve en español con emojis.`;

    const aiResponse = await this.callOllama(prompt);
    return aiResponse || this.getOfflineAnalysis(summary);
  }

  private getOfflineAnalysis(summary: ActivitySummary): string {
    return `📊 **${summary.periodLabel}**\n🏃 Running: ${summary.running.count} sesiones, ${(summary.running.totalDistance/1000).toFixed(1)}km\n💪 Fuerza: ${summary.strength.count} sesiones\n📈 Promedio: ${summary.weeklyAverage.runningKm.toFixed(1)}km/semana`;
  }

  async chat(message: string, activities: any[], conversationHistory: any[], period: string, goals: any[]): Promise<string> {
    const summary = this.createDetailedSummary(activities, period);
    
    const context = `Eres un coach de running amigable. Datos del atleta (${summary.periodLabel}):
- Running: ${summary.running.count} sesiones, ${(summary.running.totalDistance/1000).toFixed(1)}km, ${summary.weeklyAverage.runningKm.toFixed(1)}km/semana
- Fuerza: ${summary.strength.count} sesiones
${goals.length > 0 ? `- Objetivo: ${goals[0].name}` : ''}

Responde en español de forma breve y motivadora.`;

    const recentHistory = conversationHistory.slice(-4).map(m => 
      `${m.role === 'user' ? 'Atleta' : 'Coach'}: ${m.content}`
    ).join('\n');

    const prompt = `${context}\n\n${recentHistory ? `Conversación reciente:\n${recentHistory}\n\n` : ''}Atleta: ${message}\n\nCoach:`;

    const aiResponse = await this.callOllama(prompt);
    return aiResponse || 'Lo siento, no pude procesar tu mensaje. ¿Puedes intentar de nuevo?';
  }

  private createDetailedSummary(activities: any[], period: string): ActivitySummary {
    const running = activities.filter(a => a.activityCategory === 'cardio_running');
    const strength = activities.filter(a => a.activityCategory === 'strength');
    const cycling = activities.filter(a => a.activityCategory === 'cardio_cycling');

    let weeksInPeriod = this.getWeeksInPeriod(period);
    
    if (period === 'all' && activities.length > 0) {
      const sorted = [...activities].sort((a, b) => 
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );
      const first = new Date(sorted[0].startTime);
      const last = new Date(sorted[sorted.length - 1].startTime);
      weeksInPeriod = Math.max(1, Math.ceil((last.getTime() - first.getTime()) / (7 * 24 * 60 * 60 * 1000)));
    }

    return {
      period,
      periodLabel: this.getPeriodLabel(period),
      totalActivities: activities.length,
      running: this.calculateCategoryStats(running),
      strength: this.calculateCategoryStats(strength),
      cycling: this.calculateCategoryStats(cycling),
      weeklyAverage: {
        runningSessions: running.length / weeksInPeriod,
        runningKm: (running.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000) / weeksInPeriod,
        strengthSessions: strength.length / weeksInPeriod,
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
    
    const midpoint = Math.floor(activities.length / 2);
    const recent = activities.slice(0, midpoint);
    const older = activities.slice(midpoint);

    const recentRunning = recent.filter(a => a.activityCategory === 'cardio_running');
    const olderRunning = older.filter(a => a.activityCategory === 'cardio_running');

    if (recentRunning.length === 0 || olderRunning.length === 0) return 'insufficient_data';

    const recentAvg = recentRunning.reduce((sum, a) => sum + (a.distance || 0), 0) / recentRunning.length;
    const olderAvg = olderRunning.reduce((sum, a) => sum + (a.distance || 0), 0) / olderRunning.length;

    if (recentAvg > olderAvg * 1.1) return 'improving';
    if (recentAvg < olderAvg * 0.9) return 'declining';
    return 'stable';
  }
}

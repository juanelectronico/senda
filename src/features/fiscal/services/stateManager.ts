// src/features/fiscal/services/stateManager.ts

import { ConversationStage, FiscalData } from '../types';

interface ConversationState {
  stage: ConversationStage;
  fiscalData?: FiscalData;
  invoiceId?: string;
  lastActivity: Date;
  attempts: number;
}

export class ConversationStateManager {
  private states: Map<string, ConversationState> = new Map();
  private readonly SESSION_TIMEOUT = 60; // minutos

  getState(userId: string): ConversationState {
    if (!this.states.has(userId)) {
      this.states.set(userId, {
        stage: ConversationStage.IDLE,
        lastActivity: new Date(),
        attempts: 0
      });
    }
    return this.states.get(userId)!;
  }

  updateState(userId: string, updates: Partial<ConversationState>) {
    const current = this.getState(userId);
    this.states.set(userId, { 
      ...current, 
      ...updates, 
      lastActivity: new Date() 
    });
  }

  resetState(userId: string) {
    this.states.delete(userId);
  }

  isSessionExpired(userId: string): boolean {
    const state = this.getState(userId);
    const elapsed = (Date.now() - state.lastActivity.getTime()) / (1000 * 60);
    return elapsed > this.SESSION_TIMEOUT;
  }
}
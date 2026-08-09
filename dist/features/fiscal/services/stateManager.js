// src/features/fiscal/services/stateManager.ts
import { ConversationStage } from '../types';
export class ConversationStateManager {
    states = new Map();
    SESSION_TIMEOUT = 60; // minutos
    getState(userId) {
        if (!this.states.has(userId)) {
            this.states.set(userId, {
                stage: ConversationStage.IDLE,
                lastActivity: new Date(),
                attempts: 0
            });
        }
        return this.states.get(userId);
    }
    updateState(userId, updates) {
        const current = this.getState(userId);
        this.states.set(userId, {
            ...current,
            ...updates,
            lastActivity: new Date()
        });
    }
    resetState(userId) {
        this.states.delete(userId);
    }
    isSessionExpired(userId) {
        const state = this.getState(userId);
        const elapsed = (Date.now() - state.lastActivity.getTime()) / (1000 * 60);
        return elapsed > this.SESSION_TIMEOUT;
    }
}

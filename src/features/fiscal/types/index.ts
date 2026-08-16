// src/features/fiscal/types/index.ts

export interface FiscalData {
  rfc: string;
  razonSocial: string;
  regimenFiscal: string;
  usoCFDI: string;
  codigoPostal: string;
  email: string;
  monto?: number;
}

export interface Invoice {
  id: string;
  clienteId: string;
  fiscalData: FiscalData;
  monto: number;
  concepto: string;
  status: 'PENDING' | 'COMPLETED' | 'REJECTED';
  createdAt: Date;
  updatedAt: Date;
}

export enum ConversationStage {
  IDLE = 'IDLE',
  WAITING_FISCAL_DATA = 'WAITING_FISCAL_DATA',
  WAITING_MERCHANT = 'WAITING_MERCHANT',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED'
}
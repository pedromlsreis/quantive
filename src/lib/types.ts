export interface FactRow {
  date: Date;
  idSource: string;
  sourceVl: number;
}

export interface RefSource {
  idSource: string;
  idVolatType: number;
  isCrypto: boolean;
  transferableInDays: boolean;
}

export interface RefVolatType {
  idVolatType: number;
  volatTypeDsc: string;
}

export interface PortfolioData {
  facts: FactRow[];
  refSources: RefSource[];
  refVolatTypes: RefVolatType[];
}

export interface EnrichedFact extends FactRow {
  volatType: string;
  isCrypto: boolean;
  isLiquid: boolean;
}

export interface SourceDetail {
  name: string;
  value: number;
  volatType: string;
  isCrypto: boolean;
  isLiquid: boolean;
}

export interface Snapshot {
  date: Date;
  total: number;
  sources: SourceDetail[];
}

export interface FilterState {
  dateRange: [Date | null, Date | null];
  sources: string[];
  volatTypes: string[];
  cryptoFilter: 'all' | 'crypto' | 'non-crypto';
  liquidFilter: 'all' | 'liquid' | 'non-liquid';
}

export interface KPIData {
  currentNetWorth: number;
  momChange: number;
  yoyChange: number;
  yoyNetWorth: number;
  sourceCount: number;
  volatilePercent: number;
  cryptoPercent: number;
  liquidPercent: number;
}

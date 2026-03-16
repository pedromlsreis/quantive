export interface FactRow {
  date: Date;
  idSource: string;
  sourceVl: number;
}

export interface RefSource {
  idSource: string;
  volatType: string;
  transferableInDays: boolean;
}

export interface PortfolioData {
  facts: FactRow[];
  refSources: RefSource[];
}

export interface EnrichedFact extends FactRow {
  volatType: string;
  isLiquid: boolean;
}

export interface SourceDetail {
  name: string;
  value: number;
  volatType: string;
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
  liquidFilter: 'all' | 'liquid' | 'non-liquid';
}

export interface KPIData {
  currentNetWorth: number;
  momChange: number;
  yoyChange: number;
  yoyNetWorth: number;
  sourceCount: number;
  volatilePercent: number;
  liquidPercent: number;
}

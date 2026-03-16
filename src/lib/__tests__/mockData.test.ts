import { describe, it, expect } from 'vitest';
import { generateMockData } from '@/lib/mockData';

describe('generateMockData', () => {
  const data = generateMockData();

  it('returns a valid PortfolioData structure', () => {
    expect(data).toHaveProperty('facts');
    expect(data).toHaveProperty('refSources');
  });

  it('generates facts with required fields', () => {
    expect(data.facts.length).toBeGreaterThan(0);
    const fact = data.facts[0];
    expect(fact).toHaveProperty('date');
    expect(fact).toHaveProperty('idSource');
    expect(fact).toHaveProperty('sourceVl');
    expect(fact.date).toBeInstanceOf(Date);
    expect(typeof fact.idSource).toBe('string');
    expect(typeof fact.sourceVl).toBe('number');
  });

  it('generates 6 reference sources', () => {
    expect(data.refSources).toHaveLength(6);
    data.refSources.forEach(s => {
      expect(s).toHaveProperty('idSource');
      expect(typeof s.volatType).toBe('string');
      expect(typeof s.transferableInDays).toBe('boolean');
    });
  });

  it('generates facts for all 6 sources per month', () => {
    // Group by date
    const byDate = new Map<number, number>();
    data.facts.forEach(f => {
      const key = f.date.getTime();
      byDate.set(key, (byDate.get(key) || 0) + 1);
    });
    byDate.forEach(count => {
      expect(count).toBe(6);
    });
  });

  it('all source values are positive', () => {
    data.facts.forEach(f => {
      expect(f.sourceVl).toBeGreaterThan(0);
    });
  });
});

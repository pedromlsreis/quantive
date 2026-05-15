import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { analytics } from '@/lib/analytics';

export default function DemoRedirect() {
  const navigate = useNavigate();
  const { loadMockData } = usePortfolio();

  useEffect(() => {
    loadMockData();
    analytics.demoLoaded({ source: 'route' });
    navigate('/dashboard', { replace: true });
  }, [loadMockData, navigate]);

  return null;
}

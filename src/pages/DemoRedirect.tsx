import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePortfolio } from '@/contexts/PortfolioContext';

export default function DemoRedirect() {
  const navigate = useNavigate();
  const { loadMockData } = usePortfolio();

  useEffect(() => {
    loadMockData();
    navigate('/dashboard', { replace: true });
  }, [loadMockData, navigate]);

  return null;
}

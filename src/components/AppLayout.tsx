import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Hero from './Hero';
import CoachDashboard from './dashboard/CoachDashboard';
import RefereeDashboard from './dashboard/RefereeDashboard';
import { Loader2 } from 'lucide-react';

const AppLayout: React.FC = () => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a1f15]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-[#FFB81C] mx-auto" />
          <p className="text-white/70 mt-4 text-sm">Loading EPRU Portal...</p>
        </div>
      </div>
    );
  }

  if (!user || !profile) {
    return <Hero />;
  }

  if (profile.role === 'coach') return <CoachDashboard />;
  if (profile.role === 'referee') return <RefereeDashboard />;

  return <Hero />;
};

export default AppLayout;

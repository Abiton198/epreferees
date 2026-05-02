import React from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut } from 'lucide-react';

const EPRU_LOGO = 'https://d64gsuwffb70l.cloudfront.net/6864f2d65357bdbaf4000c36_1777732607060_9ef1fbe3.png';

const DashboardHeader: React.FC = () => {
  const { profile, signOut } = useAuth();
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30 print:hidden">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={EPRU_LOGO} alt="EPRU" className="h-10 w-10 rounded-full bg-white border border-gray-200 p-0.5" />
          <div>
            <div className="font-bold text-[#006747] leading-none">EPRU Portal</div>
            <div className="text-xs text-gray-500 mt-0.5 capitalize">{profile?.role} Dashboard</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-semibold text-gray-900">{profile?.full_name}</div>
            <div className="text-xs text-gray-500">{profile?.email}</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#006747] to-[#004d35] text-white flex items-center justify-center font-bold">
            {profile?.full_name?.charAt(0).toUpperCase() ?? 'U'}
          </div>
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut className="w-4 h-4 mr-1.5" />
            Sign Out
          </Button>
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;

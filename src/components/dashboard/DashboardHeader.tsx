import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, Home, User, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

const EPRU_LOGO = 'https://d64gsuwffb70l.cloudfront.net/6864f2d65357bdbaf4000c36_1777732607060_9ef1fbe3.png';

const DashboardHeader: React.FC = () => {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    if (logout) {
      await logout();
      navigate('/');
    } else {
      // Emergency Fallback: If context fails, call Firebase directly
      import("@/lib/firebase").then(({ auth }) => {
        import("firebase/auth").then(({ signOut }) => {
          signOut(auth).then(() => navigate('/'));
        });
      });
    }
  };
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm print:hidden">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 flex items-center justify-between">

        {/* Left Section: Logo and Portal Name */}
        <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
          <img
            src={EPRU_LOGO}
            alt="EPRU Logo"
            className="h-12 w-12 rounded-full border border-gray-100 shadow-sm p-0.5"
          />
          <div className="hidden sm:block">
            <div className="font-black text-[#006747] leading-none text-lg tracking-tight uppercase">
              EPRU Portal
            </div>
            <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
              Official Match Management
            </div>
          </div>
        </Link>

        {/* Right Section: User Profile & Navigation */}
        <div className="flex items-center gap-4">

          {/* Quick Nav: Home */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            className="text-gray-600 hover:text-[#006747] hidden md:flex items-center gap-2"
          >
            <Home className="w-4 h-4" />
            Home
          </Button>

          <div className="h-8 w-[1px] bg-gray-200 hidden md:block"></div>

          {/* User Profile Info */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 group focus:outline-none">
                <div className="text-right flex flex-col justify-center">
                  <div className="text-sm font-black text-gray-900 group-hover:text-[#006747] transition-colors">
                    {profile?.full_name || 'User Name'}
                  </div>
                  <div className="text-xs font-bold text-[#006747] bg-emerald-50 px-2 py-0.5 rounded mt-0.5 self-end capitalize">
                    {profile?.role || 'Member'}
                  </div>
                </div>

                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#006747] to-[#004d35] text-white flex items-center justify-center font-black border-2 border-white shadow-md">
                    {profile?.full_name?.charAt(0).toUpperCase() ?? 'U'}
                  </div>
                  <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm border border-gray-100">
                    <ChevronDown className="w-3 h-3 text-gray-400" />
                  </div>
                </div>
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56 mt-2">
              <div className="p-2 px-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Signed in as</p>
                <p className="text-sm font-bold text-gray-700 truncate">{profile?.email}</p>
              </div>
              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={() => navigate('/')} className="cursor-pointer">
                <Home className="w-4 h-4 mr-2 text-gray-400" />
                Return to Home
              </DropdownMenuItem>

              <DropdownMenuItem className="cursor-pointer">
                <User className="w-4 h-4 mr-2 text-gray-400" />
                View Profile
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={handleLogout}
                className="text-red-600 font-semibold cursor-pointer focus:bg-red-50 focus:text-red-600"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

      </div>
    </header>
  );
};

export default DashboardHeader;
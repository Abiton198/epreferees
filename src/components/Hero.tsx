import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import LoginModal from './auth/LoginModal';
import { Shield, ClipboardList, Users, BarChart3, LogIn } from 'lucide-react';

const HERO_BG = 'https://d64gsuwffb70l.cloudfront.net/69f60c7f1f6e36b4505475f9_1777732877517_d02de9d7.png';
const EPRU_LOGO = 'https://d64gsuwffb70l.cloudfront.net/6864f2d65357bdbaf4000c36_1777732607060_9ef1fbe3.png';
const SARU_LOGO = 'https://d64gsuwffb70l.cloudfront.net/6864f2d65357bdbaf4000c36_1777732719818_ecffd846.jpeg';
const EP_BADGE = './eplogo.jpeg';

const Hero: React.FC = () => {
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#0a1f15]">
      {/* Background image with overlay */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${HERO_BG})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a1f15]/95 via-[#003d28]/80 to-[#0a1f15]/95" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40" />

      <div className="absolute inset-0 bg-gradient-to-br from-[#0a1f15]/95 via-[#003d28]/80 to-[#0a1f15]/95" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40" />



      {/* Top nav */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-12 py-5">
        <div className="flex items-center gap-3">
          <img src={EP_BADGE} alt="EPRU" className="h-12 w-12 rounded-full bg-white/95 p-1 shadow-lg" />
          <div className="hidden sm:block">
            <div className="text-white font-bold text-lg leading-none">EPRRS</div>
            <div className="text-[#FFB81C] text-xs">Referee Management</div>
          </div>
        </div>
        <Button
          onClick={() => setLoginOpen(true)}
          className="bg-[#FFB81C] hover:bg-[#e0a417] text-[#1a1a1a] font-semibold shadow-lg shadow-[#FFB81C]/30"
        >
          <LogIn className="w-4 h-4 mr-2" />
          Login
        </Button>
      </header>

      {/* Hero content */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-12 pb-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 mb-6">
              <span className="w-2 h-2 rounded-full bg-[#FFB81C] animate-pulse" />
              <span className="text-white/90 text-sm font-medium">Official Referee Appointment Platform</span>
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-white leading-[1.05] tracking-tight">
              Manage Match
              <br />
              <span className="bg-gradient-to-r from-[#FFB81C] to-[#ffd76b] bg-clip-text text-transparent">
                Appointments
              </span>
              <br />
              with Precision
            </h1>
            <p className="mt-6 text-lg md:text-xl text-white/80 max-w-xl leading-relaxed">
              A secure, role-based platform connecting coaches and referees across the
              Eastern Province Rugby Union. Built with full audit trail compliance and
              real-time appointment tracking.
            </p>

            {/* Mobile watermark logo */}
            <div className="absolute inset-0 flex items-center justify-center lg:hidden pointer-events-none overflow-hidden">
              <img
                src={EP_BADGE}
                alt="EPRU Watermark"
                className="w-[85vw] max-w-[420px] object-contain opacity-[0.05] blur-[1.5px] rotate-[-12deg] animate-pulse"
              />
            </div>

            <div className="mt-8 flex flex-wrap gap-4">
              <Button
                onClick={() => setLoginOpen(true)}
                size="lg"
                className="bg-[#FFB81C] hover:bg-[#e0a417] text-[#1a1a1a] font-bold text-base px-8 h-14 shadow-2xl shadow-[#FFB81C]/40 hover:scale-105 transition-transform"
              >
                Access Portal
                <LogIn className="w-5 h-5 ml-2" />
              </Button>
              <Button
                onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                size="lg"
                variant="outline"
                className="bg-white/5 backdrop-blur-sm border-white/30 text-white hover:bg-white/10 hover:text-white h-14 px-8"
              >
                Learn More
              </Button>
            </div>

            {/* Stats */}
            <div className="mt-12 grid grid-cols-3 gap-6 max-w-md">
              <div>
                <div className="text-3xl md:text-4xl font-black text-[#FFB81C]">100%</div>
                <div className="text-white/60 text-xs uppercase tracking-wider mt-1">Audited</div>
              </div>
              <div>
                <div className="text-3xl md:text-4xl font-black text-[#FFB81C]">2</div>
                <div className="text-white/60 text-xs uppercase tracking-wider mt-1">Roles</div>
              </div>
              <div>
                <div className="text-3xl md:text-4xl font-black text-[#FFB81C]">24/7</div>
                <div className="text-white/60 text-xs uppercase tracking-wider mt-1">Access</div>
              </div>
            </div>
          </div>

          {/* Right - Logo showcase */}
          <div className="hidden lg:flex justify-center items-center">
            <div className="relative">
              <div className="absolute -inset-10 bg-gradient-to-br from-[#FFB81C]/20 via-[#006747]/20 to-transparent rounded-full blur-3xl" />
              <div className="relative grid grid-cols-2 gap-6">
                <div className="bg-white/95 backdrop-blur-sm rounded-3xl p-8 shadow-2xl border border-white/20 transform hover:scale-105 transition">
                  <img src={EP_BADGE} alt="EPRU" className="w-44 h-44 object-contain mx-auto" />
                  <div className="text-center mt-4 text-sm font-bold text-[#1a1a1a]">Eastern Province Rugby Union</div>
                </div>
                <div className="bg-gradient-to-br from-[#006747] to-[#004d35] rounded-3xl p-8 shadow-2xl border border-white/20 transform hover:scale-105 transition mt-12">
                  <img src={SARU_LOGO} alt="SA Rugby" className="w-44 h-44 object-contain mx-auto rounded-2xl" />
                  <div className="text-center mt-4 text-sm font-bold text-white">SA Rugby Affiliated</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features section */}
      <div id="features" className="relative z-10 bg-gradient-to-b from-transparent to-black/60 backdrop-blur-sm border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-16">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Shield, title: 'Role-Based Access', desc: 'Coaches and referees see only what they are authorized to access.' },
              { icon: ClipboardList, title: 'Full Audit Trail', desc: 'Every action is logged with timestamps and immutable history.' },
              { icon: Users, title: 'Smart Assignments', desc: 'Coaches assign referees to matches with one-click workflow.' },
              { icon: BarChart3, title: 'Print Reports', desc: 'Generate PDF reports for compliance and record-keeping.' },
            ].map((f, i) => (
              <div key={i} className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition group">
                <div className="w-12 h-12 rounded-xl bg-[#FFB81C]/20 flex items-center justify-center mb-4 group-hover:bg-[#FFB81C] transition">
                  <f.icon className="w-6 h-6 text-[#FFB81C] group-hover:text-[#1a1a1a]" />
                </div>
                <h3 className="text-white font-bold text-lg mb-2">{f.title}</h3>
                <p className="text-white/70 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 text-center text-white/50 text-sm">
            © {new Date().getFullYear()} Eastern Province Rugby Union — Referee Appointment System
          </div>
        </div>
      </div>

      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
  );
};

export default Hero;

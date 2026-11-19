import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import LoginModal from './auth/LoginModal';
import { ShieldCheck, ClipboardCheck, Star, LogIn, ArrowDown } from 'lucide-react';

const HERO_BG = 'https://d64gsuwffb70l.cloudfront.net/69f60c7f1f6e36b4505475f9_1777732877517_d02de9d7.png';
const SARU_LOGO = 'https://d64gsuwffb70l.cloudfront.net/6864f2d65357bdbaf4000c36_1777732719818_ecffd846.jpeg';
const EP_BADGE = './eplogo.jpeg';

const Hero: React.FC = () => {
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#06150e] flex flex-col justify-between selection:bg-[#FFB81C] selection:text-[#0a1f15]">
      {/* Background Image & Refined Layered Overlays */}
      <div
        className="absolute inset-0 bg-cover bg-center scale-105"
        style={{ backgroundImage: `url(${HERO_BG})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#06150e]/90 via-[#003d28]/80 to-[#06150e]" />
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-[#FFB81C]/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/2 -left-32 w-96 h-96 bg-[#006747]/30 rounded-full blur-[120px] pointer-events-none" />

      {/* Clean Sticky-Feel Top Navigation */}
      <header className="relative z-20 max-w-7xl w-full mx-auto flex items-center justify-between px-5 sm:px-8 lg:px-12 py-5">
        <div className="flex items-center gap-3">
          <img
            src={EP_BADGE}
            alt="EPRU"
            className="h-11 w-11 sm:h-12 sm:w-12 rounded-full bg-white p-1 shadow-lg ring-2 ring-[#FFB81C]/40 object-contain"
          />
          <div>
            <div className="text-white font-extrabold text-base sm:text-lg tracking-tight leading-none">
              EPRRS <span className="text-[#FFB81C]">PORTAL</span>
            </div>
            <div className="text-white/60 text-[11px] sm:text-xs mt-0.5">
              Match Officials & Coaching
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => setLoginOpen(true)}
            size="sm"
            variant="outline"
            className="bg-white/10 hover:bg-[#FFB81C] text-white hover:text-[#0a1f15] border-white/20 hover:border-[#FFB81C] font-semibold transition-all rounded-full px-4"
          >
            <LogIn className="w-4 h-4 mr-1.5" />
            Sign In
          </Button>
          <img
            src={SARU_LOGO}
            alt="SA Rugby"
            className="hidden sm:block h-11 w-11 rounded-full bg-white p-1 shadow-lg object-contain"
          />
        </div>
      </header>

      {/* Main Hero Section */}
      <main className="relative z-10 max-w-7xl w-full mx-auto px-5 sm:px-8 lg:px-12 py-8 sm:py-14 lg:py-20 my-auto">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          {/* Left Column: Focused Copy & Actions */}
          <div className="lg:col-span-7 text-center lg:text-left">
            {/* Live Status Pill */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 mb-6">
              <span className="w-2 h-2 rounded-full bg-[#FFB81C] animate-pulse" />
              <span className="text-white/90 text-xs sm:text-sm font-medium tracking-wide">
                Eastern Province Rugby Referees Society
              </span>
            </div>

            {/* Bold Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black text-white leading-[1.08] tracking-tight">
              Precision Match
              <span className="block bg-gradient-to-r from-[#FFB81C] via-[#ffd76b] to-[#FFB81C] bg-clip-text text-transparent mt-1">
                Officiating & Coaching
              </span>
            </h1>

            {/* Concise Subtitle */}
            <p className="mt-5 text-base sm:text-lg text-white/75 max-w-xl mx-auto lg:mx-0 leading-relaxed">
              Seamless match appointments, graded referee performance evaluations, and
              full audit compliance—built for EPRU coaches, referees, and executives.
            </p>

            {/* Mobile-Friendly Action Buttons */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3.5">
              <Button
                onClick={() => setLoginOpen(true)}
                size="lg"
                className="w-full sm:w-auto bg-[#FFB81C] hover:bg-[#e5a312] text-[#0a1f15] font-bold text-base px-8 h-13 sm:h-14 rounded-xl shadow-xl shadow-[#FFB81C]/25 transition-all hover:-translate-y-0.5"
              >
                Access Portal
                <LogIn className="w-5 h-5 ml-2" />
              </Button>
              <Button
                onClick={() =>
                  document.getElementById('pillars')?.scrollIntoView({ behavior: 'smooth' })
                }
                size="lg"
                variant="ghost"
                className="w-full sm:w-auto text-white/85 hover:text-white hover:bg-white/10 h-13 sm:h-14 px-6 rounded-xl"
              >
                Explore Features
                <ArrowDown className="w-4 h-4 ml-2 opacity-70" />
              </Button>
            </div>

            {/* Compact Trust Strip */}
            <div className="mt-10 pt-6 border-t border-white/10 flex flex-wrap items-center justify-center lg:justify-start gap-6 sm:gap-10 text-sm">
              <div>
                <span className="text-xl sm:text-2xl font-black text-[#FFB81C]">100%</span>
                <span className="text-white/60 text-xs uppercase tracking-wider ml-2">
                  Audit Logged
                </span>
              </div>
              <div className="h-4 w-px bg-white/15 hidden sm:block" />
              <div>
                <span className="text-xl sm:text-2xl font-black text-white">Real-Time</span>
                <span className="text-white/60 text-xs uppercase tracking-wider ml-2">
                  Appointments
                </span>
              </div>
              <div className="h-4 w-px bg-white/15 hidden sm:block" />
              <div>
                <span className="text-xl sm:text-2xl font-black text-white">5★</span>
                <span className="text-white/60 text-xs uppercase tracking-wider ml-2">
                  Match Grading
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Clean Affiliation Showcase (Desktop & Compact Mobile Banner) */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="relative w-full max-w-md">
              <div className="absolute -inset-4 bg-gradient-to-tr from-[#FFB81C]/20 to-[#006747]/30 rounded-3xl blur-2xl" />

              <div className="relative bg-white/[0.06] backdrop-blur-xl border border-white/15 rounded-3xl p-6 sm:p-8 shadow-2xl">
                <div className="grid grid-cols-2 gap-4 items-center">
                  <div className="bg-white rounded-2xl p-4 sm:p-5 text-center shadow-md">
                    <img
                      src={EP_BADGE}
                      alt="Eastern Province Rugby Union"
                      className="w-20 h-20 sm:w-28 sm:h-28 object-contain mx-auto"
                    />
                    <p className="mt-3 text-xs font-extrabold text-[#0a1f15] leading-tight">
                      EPRU Affiliated
                    </p>
                  </div>

                  <div className="bg-gradient-to-b from-[#006747] to-[#004630] rounded-2xl p-4 sm:p-5 text-center shadow-md border border-white/10">
                    <img
                      src={SARU_LOGO}
                      alt="SA Rugby Affiliated"
                      className="w-20 h-20 sm:w-28 sm:h-28 object-contain mx-auto rounded-xl bg-white p-1"
                    />
                    <p className="mt-3 text-xs font-extrabold text-white leading-tight">
                      SARU Affiliated
                    </p>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-white/70">
                  <span>Role-Based Portal</span>
                  <span className="text-[#FFB81C] font-semibold">
                    Coaches • Referees • Execs
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Clean 3-Pillar Bottom Strip (Less Crowded than 4 Cards) */}
      <footer
        id="pillars"
        className="relative z-10 bg-black/50 backdrop-blur-md border-t border-white/10"
      >
        <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-10 sm:py-12">
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                icon: ShieldCheck,
                title: 'Role-Based Workspaces',
                desc: 'Tailored dashboards for Coaches, Referees, and Executives with instant appointment alerts.',
              },
              {
                icon: Star,
                title: 'Graded Match Reports',
                desc: 'Auto-filled fixture forms with 5-star referee ratings, penalty stats, and incident logs.',
              },
              {
                icon: ClipboardCheck,
                title: 'Immutable Audit Trail',
                desc: 'Every acceptance, rating, and report submission is timestamped and recorded automatically.',
              },
            ].map((item, idx) => (
              <div
                key={idx}
                className="flex items-start gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.07] transition"
              >
                <div className="w-10 h-10 rounded-xl bg-[#FFB81C]/15 flex items-center justify-center shrink-0 mt-0.5">
                  <item.icon className="w-5 h-5 text-[#FFB81C]" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm sm:text-base">{item.title}</h3>
                  <p className="text-white/65 text-xs sm:text-sm mt-1 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 pt-6 border-t border-white/10 text-center text-white/45 text-xs flex flex-col sm:flex-row items-center justify-center gap-1.5">
            <span>© {new Date().getFullYear()} EPRU — Referee & Coaching Appointment System</span>
            <span className="hidden sm:inline text-white/25">•</span>
            <span>Developed by NSD</span>
          </div>
        </div>
      </footer>

      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
  );
};

export default Hero;
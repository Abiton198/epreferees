import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trophy, Award, TrendingUp, TrendingDown, Minus, Star, X } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface RefereeLeaderboardProps {
    /** Optional pre-fetched reports array; if omitted, queries `coachReports` directly */
    reports?: any[];
}

interface RefereeStats {
    id: string;
    name: string;
    email: string;
    matchesAssessed: number;
    stars: { 1: number; 2: number; 3: number; 4: number; 5: number };
    totalPoints: number;
    previousRank?: number;
    currentRank: number;
    trend: 'up' | 'down' | 'same';
}

export const RefereeLeaderboard: React.FC<RefereeLeaderboardProps> = ({ reports: propReports }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [fetchedReports, setFetchedReports] = useState<any[]>([]);

    // Fetch `coachReports` directly if reports prop is not provided
    useEffect(() => {
        if (propReports !== undefined) return;

        const unsub = onSnapshot(collection(db, 'coachReports'), (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setFetchedReports(list);
        });

        return () => unsub();
    }, [propReports]);

    const activeReports = propReports !== undefined ? propReports : fetchedReports;

    // ── Compute Referee Points & Star Breakdown ──────────────────────────────────
    const leaderboardData = useMemo(() => {
        const refMap: Record<string, RefereeStats> = {};

        activeReports.forEach((r) => {
            const ref = r.referee || {};
            const refId = ref.uid || ref.id || r.refereeId || ref.email || 'unknown';
            const refName = ref.name || r.refereeName || 'Unnamed Official';
            const refEmail = ref.email || r.refereeEmail || '';

            // Extract rating (supports r.rating or r.overallRating)
            const rating = Number(r.rating || r.overallRating || 0);

            if (!refMap[refId]) {
                refMap[refId] = {
                    id: refId,
                    name: refName,
                    email: refEmail,
                    matchesAssessed: 0,
                    stars: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
                    totalPoints: 0,
                    currentRank: 0,
                    trend: 'same',
                };
            }

            const entry = refMap[refId];
            entry.matchesAssessed += 1;

            if (rating >= 1 && rating <= 5) {
                const starKey = rating as 1 | 2 | 3 | 4 | 5;
                entry.stars[starKey] = (entry.stars[starKey] || 0) + 1;
                // Every star is 20 points (e.g. 5 stars = 100 points, 4 stars = 80 points)
                entry.totalPoints += rating * 20;
            }
        });

        // Convert map to array and sort descending by Total Points
        const sorted = Object.values(refMap).sort((a, b) => b.totalPoints - a.totalPoints);

        // Assign Ranks and simulated/persisted trend movement
        return sorted.map((ref, idx) => {
            const currentRank = idx + 1;
            // In a live app, previousRank can be stored in localStorage or user profile.
            // Here we compare against a stored session rank or default to 'same'.
            const storedPrev = localStorage.getItem(`ref_rank_${ref.id}`);
            let trend: 'up' | 'down' | 'same' = 'same';

            if (storedPrev) {
                const prevRank = Number(storedPrev);
                if (currentRank < prevRank) trend = 'up'; // Lower number is higher rank
                else if (currentRank > prevRank) trend = 'down';
            }

            localStorage.setItem(`ref_rank_${ref.id}`, String(currentRank));

            return {
                ...ref,
                currentRank,
                trend,
            };
        });
    }, [activeReports]);

    const topReferee = leaderboardData[0];

    return (
        <>
            {/* ── Floating Round Circle Button (Corner of Report Summaries) ── */}
            <div className="fixed bottom-6 right-6 z-50 print:hidden">
                <button
                    onClick={() => setIsOpen(true)}
                    className="group relative flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-[#006747] to-emerald-600 text-white rounded-full shadow-2xl hover:scale-105 active:scale-95 transition-all border-2 border-white/80 ring-4 ring-emerald-900/10"
                    title="Open Referee Leaderboard"
                >
                    <Trophy className="w-6 h-6 text-amber-300 drop-shadow-sm group-hover:rotate-12 transition-transform" />

                    {leaderboardData.length > 0 && (
                        <span className="absolute -top-1 -right-1 bg-amber-500 text-slate-950 font-black text-[10px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                            {leaderboardData.length}
                        </span>
                    )}
                </button>
            </div>

            {/* ── Leaderboard Modal Dialog ── */}
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col p-0 overflow-hidden bg-slate-50">
                    <DialogHeader className="p-6 bg-gradient-to-r from-emerald-900 to-slate-900 text-white shrink-0">
                        <div className="flex items-center justify-between">
                            <Badge className="bg-amber-400 text-slate-950 font-black text-xs px-3 py-1">
                                <Trophy className="w-3.5 h-3.5 mr-1 inline-block" /> EPRU Official Rankings
                            </Badge>
                            <span className="text-xs text-slate-300 font-medium">
                                Scoring: 1 Star = 20 Points
                            </span>
                        </div>
                        <DialogTitle className="text-2xl font-black text-white pt-2">
                            Referee Assessment Leaderboard
                        </DialogTitle>
                        <p className="text-xs text-slate-300 mt-0.5">
                            Referees ranked dynamically based on accumulative points from coach performance assessments.
                        </p>
                    </DialogHeader>

                    {/* Table Container */}
                    <div className="p-6 flex-1 overflow-y-auto">
                        {leaderboardData.length === 0 ? (
                            <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200">
                                <Award className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                                <p className="text-sm font-bold text-slate-700">No assessment ratings recorded yet</p>
                                <p className="text-xs text-slate-400 mt-0.5">Leaderboard will populate as coaches submit reports.</p>
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                                            <tr>
                                                <th className="px-4 py-3.5 text-center w-16">Rank</th>
                                                <th className="px-4 py-3.5">Referee Official</th>
                                                <th className="px-4 py-3.5 text-center">MA (Assessed)</th>
                                                <th className="px-4 py-3.5 text-center">⭐ 1</th>
                                                <th className="px-4 py-3.5 text-center">⭐ 2</th>
                                                <th className="px-4 py-3.5 text-center">⭐ 3</th>
                                                <th className="px-4 py-3.5 text-center">⭐ 4</th>
                                                <th className="px-4 py-3.5 text-center">⭐ 5</th>
                                                <th className="px-4 py-3.5 text-right font-black">Points</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {leaderboardData.map((ref, index) => {
                                                const isTop = index === 0;
                                                return (
                                                    <tr
                                                        key={ref.id}
                                                        className={`transition-colors ${isTop ? 'bg-amber-50/60 font-semibold' : 'hover:bg-slate-50/80'
                                                            }`}
                                                    >
                                                        {/* Rank & Trend Arrow */}
                                                        <td className="px-4 py-3 text-center">
                                                            <div className="flex items-center justify-center gap-1">
                                                                <span
                                                                    className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-black text-xs ${index === 0
                                                                            ? 'bg-amber-500 text-white shadow-sm'
                                                                            : index === 1
                                                                                ? 'bg-slate-300 text-slate-800'
                                                                                : index === 2
                                                                                    ? 'bg-amber-700 text-white'
                                                                                    : 'bg-slate-100 text-slate-600'
                                                                        }`}
                                                                >
                                                                    {ref.currentRank}
                                                                </span>

                                                                {/* Trend Indicator */}
                                                                {ref.trend === 'up' && (
                                                                    <TrendingUp className="w-3.5 h-3.5 text-emerald-600" title="Moved Up" />
                                                                )}
                                                                {ref.trend === 'down' && (
                                                                    <TrendingDown className="w-3.5 h-3.5 text-rose-600" title="Moved Down" />
                                                                )}
                                                                {ref.trend === 'same' && (
                                                                    <Minus className="w-3 h-3 text-slate-300" title="No Movement" />
                                                                )}
                                                            </div>
                                                        </td>

                                                        {/* Referee Name */}
                                                        <td className="px-4 py-3">
                                                            <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                                                                {ref.name}
                                                                {isTop && (
                                                                    <span className="bg-amber-100 text-amber-800 text-[9px] uppercase font-black px-1.5 py-0.5 rounded border border-amber-300">
                                                                        Leader 👑
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-[11px] text-slate-400 font-normal">
                                                                {ref.email || 'Official Assessed'}
                                                            </div>
                                                        </td>

                                                        {/* Matches Assessed (MA) */}
                                                        <td className="px-4 py-3 text-center font-bold text-slate-700">
                                                            {ref.matchesAssessed}
                                                        </td>

                                                        {/* Star 1 to 5 counts */}
                                                        <td className="px-4 py-3 text-center text-slate-600">{ref.stars[1]}</td>
                                                        <td className="px-4 py-3 text-center text-slate-600">{ref.stars[2]}</td>
                                                        <td className="px-4 py-3 text-center text-slate-600">{ref.stars[3]}</td>
                                                        <td className="px-4 py-3 text-center text-slate-600">{ref.stars[4]}</td>
                                                        <td className="px-4 py-3 text-center text-slate-600">{ref.stars[5]}</td>

                                                        {/* Accumulated Points */}
                                                        <td className="px-4 py-3 text-right">
                                                            <span className="font-black text-sm text-[#006747] bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                                                                {ref.totalPoints} pts
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="p-4 bg-white border-t border-slate-200 shrink-0 flex items-center justify-between">
                        <span className="text-xs text-slate-400">
                            Rankings update automatically upon new coach report submissions.
                        </span>
                        <Button variant="outline" onClick={() => setIsOpen(false)}>
                            Close Leaderboard
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default RefereeLeaderboard;
import React, { useMemo, useState } from 'react';
import type { Appointment, Profile } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Search, Calendar, UserCheck, Trophy,
    MapPin, CheckCircle2, Clock, XCircle, FileText, User
} from 'lucide-react';

interface RefereeMatchSummariesProps {
    appointments: Appointment[];
    referees: Record<string, Profile>;
}

export const RefereeMatchSummaries: React.FC<RefereeMatchSummariesProps> = ({
    appointments,
    referees,
}) => {
    // Filter States
    const [selectedRefereeId, setSelectedRefereeId] = useState<string>('all');
    const [matchTypeFilter, setMatchTypeFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');

    // Extract unique match types/competitions for the filter dropdown
    const matchTypes = useMemo(() => {
        const types = new Set<string>();
        appointments.forEach((a: any) => {
            const type = a.competition || a.matchType;
            if (type) types.add(type);
        });
        return Array.from(types);
    }, [appointments]);

    // Transform referees mapping into a unique, sorted array (deduplicated by full_name)
    const refereeList = useMemo(() => {
        const rawList = Object.values(referees);

        // Deduplicate by normalized name (or ref.id if preferred)
        const uniqueMap = new Map<string, Profile>();

        rawList.forEach((ref) => {
            const nameKey = (ref.full_name || '').trim().toLowerCase();
            if (nameKey && !uniqueMap.has(nameKey)) {
                uniqueMap.set(nameKey, ref);
            }
        });

        return Array.from(uniqueMap.values()).sort((a, b) =>
            (a.full_name || '').localeCompare(b.full_name || '')
        );
    }, [referees]);

    // Filter appointments based on controls
    const filteredAppointments = useMemo(() => {
        return appointments.filter((a: any) => {
            if (a.deleted) return false;

            // Filter by Referee
            if (selectedRefereeId !== 'all' && a.refereeId !== selectedRefereeId) {
                return false;
            }

            // Filter by Match Type (Club, School, League, etc.)
            if (matchTypeFilter !== 'all') {
                const type = (a.competition || a.matchType || '').toLowerCase();
                if (!type.includes(matchTypeFilter.toLowerCase())) {
                    return false;
                }
            }

            // Filter by Search Query (Team / Venue)
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const matchesQuery =
                    a.homeTeam?.toLowerCase().includes(q) ||
                    a.awayTeam?.toLowerCase().includes(q) ||
                    a.venue?.toLowerCase().includes(q);
                if (!matchesQuery) return false;
            }

            // Filter by Date Range
            if (a.matchDate) {
                if (startDate && a.matchDate < startDate) return false;
                if (endDate && a.matchDate > endDate) return false;
            }

            return true;
        });
    }, [appointments, selectedRefereeId, matchTypeFilter, searchQuery, startDate, endDate]);

    // Dynamic Summaries / Breakdown Aggregations
    const summaryTotals = useMemo(() => {
        const breakdown: Record<string, number> = {};
        let totalMatches = 0;
        let accepted = 0;
        let pending = 0;
        let rejected = 0;

        filteredAppointments.forEach((a: any) => {
            totalMatches++;

            // Categorize match type (default to 'Other' if empty)
            const rawType = a.competition || a.matchType || 'Uncategorized';
            const key = rawType.trim();
            breakdown[key] = (breakdown[key] || 0) + 1;

            // Status counters
            if (a.status === 'accepted') accepted++;
            else if (a.status === 'pending') pending++;
            else if (a.status === 'rejected') rejected++;
        });

        return { totalMatches, accepted, pending, rejected, breakdown };
    }, [filteredAppointments]);

    // Selected referee display details
    const activeReferee = selectedRefereeId !== 'all' ? referees[selectedRefereeId] : null;

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-8">
            {/* Header Banner - Responsive */}
            <div className="bg-gradient-to-r from-emerald-900 to-slate-900 p-4 sm:p-6 text-white">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-emerald-400 shrink-0" />
                            <h2 className="text-lg sm:text-xl font-black tracking-tight">
                                Executive Referee Match Summaries
                            </h2>
                        </div>
                        <p className="text-xs text-slate-300 mt-1">
                            Select a referee to view assigned fixtures, match type distributions, and period totals.
                        </p>
                    </div>

                    {activeReferee && (
                        <div className="bg-white/10 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10 flex items-center gap-3 self-start sm:self-auto">
                            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-300 font-bold border border-emerald-400/30 text-xs sm:text-sm">
                                {activeReferee.full_name?.charAt(0) || 'R'}
                            </div>
                            <div>
                                <div className="text-[10px] sm:text-xs text-slate-300 font-medium">Selected Official</div>
                                <div className="text-xs sm:text-sm font-bold text-white">{activeReferee.full_name}</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Control Bar & Filters - Responsive Inputs */}
            <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/50 space-y-3 sm:space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {/* Referee Selection Dropdown */}
                    <div className="space-y-1">
                        <label className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Select Referee
                        </label>
                        <Select value={selectedRefereeId} onValueChange={setSelectedRefereeId}>
                            <SelectTrigger className="bg-white border-slate-200 h-10 text-xs sm:text-sm">
                                <SelectValue placeholder="All Referees" />
                            </SelectTrigger>
                            <SelectContent className="max-h-60">
                                <SelectItem value="all">All Referees ({refereeList.length})</SelectItem>
                                {refereeList.map((ref) => (
                                    <SelectItem key={ref.id} value={ref.id}>
                                        {ref.full_name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Match Type / Competition Dropdown */}
                    <div className="space-y-1">
                        <label className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Match Type / Competition
                        </label>
                        <Select value={matchTypeFilter} onValueChange={setMatchTypeFilter}>
                            <SelectTrigger className="bg-white border-slate-200 h-10 text-xs sm:text-sm">
                                <SelectValue placeholder="All Match Types" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Types</SelectItem>
                                {matchTypes.map((type) => (
                                    <SelectItem key={type} value={type}>
                                        {type}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Date Range - Start */}
                    <div className="space-y-1">
                        <label className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            From Date
                        </label>
                        <Input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="bg-white border-slate-200 h-10 text-xs sm:text-sm"
                        />
                    </div>

                    {/* Date Range - End */}
                    <div className="space-y-1">
                        <label className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            To Date
                        </label>
                        <Input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="bg-white border-slate-200 h-10 text-xs sm:text-sm"
                        />
                    </div>
                </div>

                {/* Search Bar & Reset */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-200/60">
                    <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search team or venue..."
                            className="pl-9 bg-white border-slate-200 h-10 text-xs sm:text-sm"
                        />
                    </div>

                    {(selectedRefereeId !== 'all' || matchTypeFilter !== 'all' || searchQuery || startDate || endDate) && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setSelectedRefereeId('all');
                                setMatchTypeFilter('all');
                                setSearchQuery('');
                                setStartDate('');
                                setEndDate('');
                            }}
                            className="text-xs text-slate-500 hover:text-slate-800 self-end sm:self-auto h-9"
                        >
                            Reset Filters
                        </Button>
                    )}
                </div>
            </div>

            {/* Appointment Listings Section */}
            <div className="p-4 sm:p-6">
                <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <h3 className="text-xs sm:text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                        {selectedRefereeId === 'all'
                            ? 'All Appointed Games'
                            : `Appointments for ${activeReferee?.full_name || 'Referee'}`}
                    </h3>
                    <span className="text-[11px] sm:text-xs font-semibold text-slate-500">
                        Showing {filteredAppointments.length} record(s)
                    </span>
                </div>

                {filteredAppointments.length === 0 ? (
                    <div className="text-center py-10 px-4 border-2 border-dashed border-slate-200 rounded-xl">
                        <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-sm font-bold text-slate-700">No appointments found</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Try adjusting the date range, referee selection, or match type filter.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Desktop / Tablet View Table (md and up) */}
                        <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                                    <tr>
                                        <th className="px-4 py-3">Fixture</th>
                                        <th className="px-4 py-3">Match Type</th>
                                        <th className="px-4 py-3">Venue</th>
                                        <th className="px-4 py-3">Date & Time</th>
                                        <th className="px-4 py-3">Official</th>
                                        <th className="px-4 py-3 text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {filteredAppointments.map((a: any) => {
                                        const refName =
                                            a.refereeName ||
                                            referees[a.refereeId]?.full_name ||
                                            'Unassigned';

                                        return (
                                            <tr key={a.id} className="hover:bg-slate-50/80 transition-colors">
                                                <td className="px-4 py-3 font-semibold text-slate-900">
                                                    {a.homeTeam} <span className="text-slate-400 font-normal">vs</span> {a.awayTeam}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded text-[11px] border border-emerald-200/60">
                                                        <Trophy className="w-3 h-3 text-emerald-600" />
                                                        {a.competition || a.matchType || 'League Match'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-slate-600">
                                                    <span className="flex items-center gap-1">
                                                        <MapPin className="w-3 h-3 text-slate-400" />
                                                        {a.venue || 'TBC'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-slate-600">
                                                    {a.matchDate || 'TBC'} {a.matchTime ? `@ ${a.matchTime}` : ''}
                                                </td>
                                                <td className="px-4 py-3 font-medium text-slate-700">
                                                    {refName}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span
                                                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${a.status === 'accepted'
                                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                : a.status === 'rejected'
                                                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                                            }`}
                                                    >
                                                        {a.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile View Cards (< md) */}
                        <div className="md:hidden space-y-3">
                            {filteredAppointments.map((a: any) => {
                                const refName =
                                    a.refereeName ||
                                    referees[a.refereeId]?.full_name ||
                                    'Unassigned';

                                return (
                                    <div key={a.id} className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-200 space-y-2">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="font-bold text-slate-900 text-sm">
                                                {a.homeTeam} <span className="text-slate-400 font-normal">vs</span> {a.awayTeam}
                                            </div>
                                            <span
                                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border shrink-0 ${a.status === 'accepted'
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                        : a.status === 'rejected'
                                                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                                                            : 'bg-amber-50 text-amber-700 border-amber-200'
                                                    }`}
                                            >
                                                {a.status}
                                            </span>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded text-[10px] border border-emerald-200/60">
                                                <Trophy className="w-3 h-3 text-emerald-600" />
                                                {a.competition || a.matchType || 'League Match'}
                                            </span>
                                            <span className="flex items-center gap-1 text-[11px] text-slate-500">
                                                <MapPin className="w-3 h-3 text-slate-400" />
                                                {a.venue || 'TBC'}
                                            </span>
                                        </div>

                                        <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
                                            <span className="flex items-center gap-1">
                                                <Calendar className="w-3 h-3 text-slate-400" />
                                                {a.matchDate || 'TBC'} {a.matchTime ? `@ ${a.matchTime}` : ''}
                                            </span>
                                            <span className="flex items-center gap-1 font-semibold text-slate-700">
                                                <User className="w-3 h-3 text-slate-400" />
                                                {refName}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}

                {/* Dynamic Multi-Color Bottom Totals Bar - Mobile Optimized Grid */}
                <div className="mt-6 pt-5 border-t border-slate-200">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                        Summary Breakdown for Selected Criteria
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 sm:gap-3">
                        {/* Grand Total */}
                        <div className="bg-slate-900 text-white rounded-xl p-2.5 sm:p-3 shadow-sm border border-slate-800">
                            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                                Total Games
                            </div>
                            <div className="text-xl sm:text-2xl font-black mt-0.5 sm:mt-1">{summaryTotals.totalMatches}</div>
                        </div>

                        {/* Categorized Match Types */}
                        {Object.entries(summaryTotals.breakdown).map(([type, count], idx) => {
                            const styles = [
                                'bg-emerald-50 border-emerald-200 text-emerald-900 text-emerald-600',
                                'bg-blue-50 border-blue-200 text-blue-900 text-blue-600',
                                'bg-purple-50 border-purple-200 text-purple-900 text-purple-600',
                                'bg-indigo-50 border-indigo-200 text-indigo-900 text-indigo-600',
                                'bg-teal-50 border-teal-200 text-teal-900 text-teal-600',
                            ];
                            const style = styles[idx % styles.length].split(' ');

                            return (
                                <div key={type} className={`${style[0]} border ${style[1]} rounded-xl p-2.5 sm:p-3 shadow-sm`}>
                                    <div className={`text-[10px] uppercase font-bold tracking-wider truncate ${style[3]}`}>
                                        {type}
                                    </div>
                                    <div className={`text-xl sm:text-2xl font-black mt-0.5 sm:mt-1 ${style[2]}`}>{count}</div>
                                </div>
                            );
                        })}

                        {/* Accepted Summary */}
                        <div className="bg-emerald-500 text-white rounded-xl p-2.5 sm:p-3 shadow-sm border border-emerald-600">
                            <div className="text-[10px] uppercase font-bold text-emerald-100 tracking-wider flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Accepted
                            </div>
                            <div className="text-xl sm:text-2xl font-black mt-0.5 sm:mt-1">{summaryTotals.accepted}</div>
                        </div>

                        {/* Pending Summary */}
                        <div className="bg-amber-500 text-white rounded-xl p-2.5 sm:p-3 shadow-sm border border-amber-600">
                            <div className="text-[10px] uppercase font-bold text-amber-100 tracking-wider flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Pending
                            </div>
                            <div className="text-xl sm:text-2xl font-black mt-0.5 sm:mt-1">{summaryTotals.pending}</div>
                        </div>

                        {/* Rejected Summary */}
                        <div className="bg-rose-500 text-white rounded-xl p-2.5 sm:p-3 shadow-sm border border-rose-600">
                            <div className="text-[10px] uppercase font-bold text-rose-100 tracking-wider flex items-center gap-1">
                                <XCircle className="w-3 h-3" /> Rejected
                            </div>
                            <div className="text-xl sm:text-2xl font-black mt-0.5 sm:mt-1">{summaryTotals.rejected}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RefereeMatchSummaries;
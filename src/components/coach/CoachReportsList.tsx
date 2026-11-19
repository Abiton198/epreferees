import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Star, Search, ChevronDown, ChevronUp, FileText, AlertTriangle } from 'lucide-react';

interface Props {
    reports: any[];
}

const CoachReportsList: React.FC<Props> = ({ reports }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | 'referee_performance' | 'incident_report'>('all');
    const [ratingFilter, setRatingFilter] = useState<string>('all');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const filteredReports = useMemo(() => {
        return reports.filter((r) => {
            const matchesType = typeFilter === 'all' || r.reportType === typeFilter;
            const matchesRating =
                ratingFilter === 'all' ||
                (r.rating && Number(r.rating) === Number(ratingFilter));

            const term = searchQuery.toLowerCase();
            const matchesSearch =
                !term ||
                r.referee?.name?.toLowerCase().includes(term) ||
                r.matchDetails?.match?.toLowerCase().includes(term) ||
                r.matchDetails?.venue?.toLowerCase().includes(term);

            return matchesType && matchesRating && matchesSearch;
        });
    }, [reports, searchQuery, typeFilter, ratingFilter]);

    return (
        <div className="space-y-4">
            {/* Filter Controls */}
            <div className="bg-white p-4 rounded-xl border shadow-sm grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                    <Input
                        placeholder="Filter by referee, match, or venue..."
                        className="pl-9"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
                    <SelectTrigger>
                        <SelectValue placeholder="Report Type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Report Types</SelectItem>
                        <SelectItem value="referee_performance">Referee Performance</SelectItem>
                        <SelectItem value="incident_report">Incident Reports</SelectItem>
                    </SelectContent>
                </Select>

                <Select value={ratingFilter} onValueChange={setRatingFilter}>
                    <SelectTrigger>
                        <SelectValue placeholder="Filter by Star Rating" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Star Ratings</SelectItem>
                        <SelectItem value="5">5 Stars</SelectItem>
                        <SelectItem value="4">4 Stars</SelectItem>
                        <SelectItem value="3">3 Stars</SelectItem>
                        <SelectItem value="2">2 Stars</SelectItem>
                        <SelectItem value="1">1 Star</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Results List */}
            {filteredReports.length === 0 ? (
                <div className="bg-white p-8 rounded-xl border text-center text-gray-500 text-sm">
                    No submitted reports match your current filters.
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredReports.map((report) => {
                        const isExpanded = expandedId === report.id;
                        const isPerf = report.reportType === 'referee_performance';

                        return (
                            <div key={report.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                                <div
                                    onClick={() => setExpandedId(isExpanded ? null : report.id)}
                                    className="p-4 flex flex-wrap items-center justify-between gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
                                >
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            {isPerf ? (
                                                <Badge className="bg-emerald-100 text-[#006747] hover:bg-emerald-100">
                                                    <FileText size={12} className="mr-1" /> Performance
                                                </Badge>
                                            ) : (
                                                <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                                                    <AlertTriangle size={12} className="mr-1" /> Incident
                                                </Badge>
                                            )}
                                            <span className="font-bold text-gray-900">{report.matchDetails?.match}</span>
                                        </div>
                                        <p className="text-xs text-gray-500">
                                            Referee: <strong className="text-gray-700">{report.referee?.name}</strong> •{' '}
                                            {report.matchDetails?.matchDate} • {report.matchDetails?.venue}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        {isPerf && report.rating && (
                                            <div className="flex items-center gap-1 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                                                {[1, 2, 3, 4, 5].map((s) => (
                                                    <Star
                                                        key={s}
                                                        size={14}
                                                        className={
                                                            s <= report.rating
                                                                ? 'fill-amber-400 text-amber-400'
                                                                : 'text-gray-300'
                                                        }
                                                    />
                                                ))}
                                            </div>
                                        )}
                                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                    </div>
                                </div>

                                {/* Expandable Detailed Notes */}
                                {isExpanded && (
                                    <div className="border-t bg-gray-50/70 p-4 text-sm space-y-3">
                                        {isPerf ? (
                                            <>
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-white p-3 rounded border">
                                                    <div>Total Pens: <strong>{report.gameStats?.totalPenalties ?? 0}</strong></div>
                                                    <div>Breakdown: <strong>{report.gameStats?.breakdownPens ?? 0}</strong></div>
                                                    <div>Scrum: <strong>{report.gameStats?.scrumPens ?? 0}</strong></div>
                                                    <div>Lineout: <strong>{report.gameStats?.lineoutPens ?? 0}</strong></div>
                                                </div>
                                                <div>
                                                    <span className="font-semibold text-gray-700">Strengths:</span>
                                                    <p className="text-gray-600 mt-0.5">{report.coachingNotes?.strengths}</p>
                                                </div>
                                                {report.coachingNotes?.improvementAreas?.length > 0 && (
                                                    <div>
                                                        <span className="font-semibold text-gray-700">Areas for Improvement:</span>
                                                        <ul className="list-disc list-inside text-gray-600 mt-0.5">
                                                            {report.coachingNotes.improvementAreas.map((note: string, i: number) => (
                                                                <li key={i}>{note}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <div className="flex gap-4 text-xs">
                                                    <span>Category: <strong className="uppercase">{report.incident?.category}</strong></span>
                                                    <span>Severity: <strong className="uppercase text-red-700">{report.incident?.severity}</strong></span>
                                                    {report.incident?.minuteOccurred && (
                                                        <span>Time: <strong>{report.incident.minuteOccurred}</strong></span>
                                                    )}
                                                </div>
                                                <div>
                                                    <span className="font-semibold text-gray-700">Description:</span>
                                                    <p className="text-gray-600 mt-0.5">{report.incident?.description}</p>
                                                </div>
                                                <div>
                                                    <span className="font-semibold text-gray-700">Action Taken:</span>
                                                    <p className="text-gray-600 mt-0.5">{report.incident?.actionTaken}</p>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default CoachReportsList;
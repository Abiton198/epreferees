import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { db } from "../../lib/firebase";
import {
    collection,
    addDoc,
    deleteDoc,
    doc,
    onSnapshot,
    updateDoc,
    serverTimestamp,
} from "firebase/firestore";
import { toast } from "@/components/ui/use-toast";

// 🎨 Predefined gradient colors for league cards
const leagueColors = [
    "from-blue-500 to-indigo-600",
    "from-green-500 to-emerald-600",
    "from-purple-500 to-fuchsia-600",
    "from-orange-500 to-red-600",
    "from-pink-500 to-rose-600",
    "from-cyan-500 to-sky-600",
];
const getLeagueColor = (league: string) => {
    const index = league
        ? league.charCodeAt(0) % leagueColors.length
        : leagueColors.length - 1;
    return leagueColors[index];
};

// 🏆 Fixed league options
const LEAGUE_OPTIONS = [
    "Grand Challenge (Top 12)",
    "Grand Challenge (Middle 12)",
    "Grand Challenge (Bottom 12)",
    "Adams Cup (A-West)",
    "Adams Cup (C-East)",
    "Gqeberha Regional",
    "Kouga Regional",
    "Sunset Regional",
    "Midlands",
];

export const TeamRegistrationForm: React.FC = () => {
    const [teams, setTeams] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // Editing state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editData, setEditData] = useState({ name: "", homeGround: "" });

    const [formData, setFormData] = useState({ name: "", homeGround: "" });
    const [search, setSearch] = useState("");
    const [filterByVenue, setFilterByVenue] = useState("");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const [expandedLeague, setExpandedLeague] = useState<string | null>(null);

    // For Move League modal
    const [moveTeamId, setMoveTeamId] = useState<string | null>(null);

    // 🔥 Real-time Firestore listener
    useEffect(() => {
        const unsub = onSnapshot(collection(db, "teams"), (snapshot) => {
            const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            setTeams(list);
        });
        return () => unsub();
    }, []);

    // ➕ Add new team
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.homeGround) {
            toast({
                title: "Missing Fields",
                description: "Please enter both team name and home ground.",
                variant: "destructive",
            });
            return;
        }

        try {
            setLoading(true);
            await addDoc(collection(db, "teams"), {
                name: formData.name.trim(),
                homeGround: formData.homeGround.trim(),
                league: null,
                createdAt: serverTimestamp(),
            });
            toast({
                title: "Team Registered",
                description: `${formData.name} added successfully ✅`,
            });
            setFormData({ name: "", homeGround: "" });
        } catch (err) {
            console.error("Error adding team:", err);
            toast({
                title: "Error",
                description: "Failed to register team.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    // 🗑️ Delete team
    const handleDelete = async (id: string) => {
        if (!window.confirm("Are you sure you want to delete this team?")) return;
        try {
            await deleteDoc(doc(db, "teams", id));
            toast({ title: "Deleted", description: "Team removed 🗑️" });
        } catch (err) {
            console.error("Error deleting team:", err);
            toast({
                title: "Error",
                description: "Failed to delete team.",
                variant: "destructive",
            });
        }
    };

    // ✏️ Edit / Save logic
    const handleEdit = (team: any) => {
        if (editingId === team.id) {
            setEditingId(null);
            setEditData({ name: "", homeGround: "" });
        } else {
            setEditingId(team.id);
            setEditData({ name: team.name, homeGround: team.homeGround });
        }
    };

    const handleSaveEdit = async (id: string) => {
        if (!editData.name || !editData.homeGround) {
            toast({
                title: "Missing Fields",
                description: "Please fill in all fields before saving.",
                variant: "destructive",
            });
            return;
        }
        try {
            await updateDoc(doc(db, "teams", id), {
                name: editData.name.trim(),
                homeGround: editData.homeGround.trim(),
                updatedAt: serverTimestamp(),
            });
            toast({ title: "Updated", description: "Team updated successfully ✅" });
            setEditingId(null);
        } catch (err) {
            console.error("Error updating team:", err);
            toast({
                title: "Error",
                description: "Failed to update team.",
                variant: "destructive",
            });
        }
    };

    // 🔁 Move team to another league
    const assignLeague = async (teamId: string, newLeague: string | null) => {
        try {
            await updateDoc(doc(db, "teams", teamId), { league: newLeague });
            toast({
                title: newLeague ? "League Updated" : "Team Unassigned",
                description: newLeague
                    ? `Team moved to ${newLeague} 🏆`
                    : "Team removed from current league.",
            });
            setMoveTeamId(null);
        } catch (err) {
            console.error("Error assigning league:", err);
            toast({
                title: "Error",
                description: "Failed to move team.",
                variant: "destructive",
            });
        }
    };

    // 🔍 Filter / Sort
    const filteredTeams = teams
        .filter((t) => {
            const matchesSearch =
                t.name?.toLowerCase().includes(search.toLowerCase()) ||
                t.homeGround?.toLowerCase().includes(search.toLowerCase());
            const matchesVenue =
                !filterByVenue ||
                t.homeGround?.toLowerCase().includes(filterByVenue.toLowerCase());
            return matchesSearch && matchesVenue;
        })
        .sort((a, b) => {
            const nameA = a.name?.toLowerCase() || "";
            const nameB = b.name?.toLowerCase() || "";
            return sortOrder === "asc"
                ? nameA.localeCompare(nameB)
                : nameB.localeCompare(nameA);
        });

    const toggleSortOrder = () =>
        setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));

    // Group teams by league
    const leagues = filteredTeams.reduce((acc: any, team: any) => {
        const leagueName = team.league || "Unassigned";
        if (!acc[leagueName]) acc[leagueName] = [];
        acc[leagueName].push(team);
        return acc;
    }, {});

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <h3 className="text-2xl font-bold text-gray-900 ml-60">Team Registration</h3>
                <Button
                    variant="outline"
                    className="shadow-lg border-gray-300 bg-white hover:bg-gray-100 transition text-gray-800 font-semibold"
                >
                    🏟️ {teams.length} Teams Registered
                </Button>
            </div>

            {/* Registration Form */}
            <form
                onSubmit={handleSubmit}
                className="p-6 border rounded-lg bg-gray-50 space-y-4"
            >
                <input
                    type="text"
                    placeholder="Team Name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border rounded-lg px-4 py-2"
                    required
                />
                <input
                    type="text"
                    placeholder="Home Ground / Venue"
                    value={formData.homeGround}
                    onChange={(e) =>
                        setFormData({ ...formData, homeGround: e.target.value })
                    }
                    className="w-full border rounded-lg px-4 py-2"
                    required
                />
                <Button type="submit" disabled={loading} className="w-full">
                    {loading ? "Saving..." : "✅ Register Team"}
                </Button>
            </form>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center border-b pb-3">
                <input
                    type="text"
                    placeholder="🔍 Search by name or venue..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="border rounded-lg px-3 py-2 flex-1"
                />
                <input
                    type="text"
                    placeholder="Filter by venue..."
                    value={filterByVenue}
                    onChange={(e) => setFilterByVenue(e.target.value)}
                    className="border rounded-lg px-3 py-2 flex-1"
                />
                <Button type="button" variant="outline" onClick={toggleSortOrder}>
                    {sortOrder === "asc" ? "⬆️ Asc" : "⬇️ Desc"}
                </Button>
            </div>

            {/* League Cards */}
            {Object.entries(leagues).map(([leagueName, leagueTeams]: any) => (
                <div
                    key={leagueName}
                    className={`rounded-xl shadow-lg text-white bg-gradient-to-r ${getLeagueColor(
                        leagueName
                    )} p-4 relative`}
                >
                    <div
                        className="flex justify-between items-center cursor-pointer"
                        onClick={() =>
                            setExpandedLeague(
                                expandedLeague === leagueName ? null : leagueName
                            )
                        }
                    >
                        <h4 className="text-xl font-semibold drop-shadow-lg">
                            🏆 {leagueName}
                        </h4>
                        <span className="absolute top-2 right-3 bg-white text-gray-900 font-semibold text-sm px-3 py-1 rounded-full shadow">
                            {leagueTeams.length}
                        </span>
                    </div>

                    {expandedLeague === leagueName && (
                        <ul className="mt-3 space-y-2 text-gray-800">
                            {leagueTeams.map((t: any) => (
                                <li
                                    key={t.id}
                                    className="border rounded-lg p-3 bg-white flex justify-between items-start"
                                >
                                    <div className="flex-1">
                                        {editingId === t.id ? (
                                            <div className="space-y-2">
                                                <input
                                                    type="text"
                                                    value={editData.name}
                                                    onChange={(e) =>
                                                        setEditData({ ...editData, name: e.target.value })
                                                    }
                                                    className="w-full border rounded-lg px-3 py-2"
                                                />
                                                <input
                                                    type="text"
                                                    value={editData.homeGround}
                                                    onChange={(e) =>
                                                        setEditData({
                                                            ...editData,
                                                            homeGround: e.target.value,
                                                        })
                                                    }
                                                    className="w-full border rounded-lg px-3 py-2"
                                                />
                                                <div className="flex gap-2">
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleSaveEdit(t.id)}
                                                        className="flex-1"
                                                    >
                                                        💾 Save
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => setEditingId(null)}
                                                        className="flex-1"
                                                    >
                                                        Cancel
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <p className="font-semibold">{t.name}</p>
                                                <p className="text-gray-600 text-sm">
                                                    🏟 {t.homeGround}
                                                </p>
                                            </>
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleEdit(t)}
                                        >
                                            {editingId === t.id ? "Close" : "✏️ Edit"}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => setMoveTeamId(t.id)}
                                        >
                                            🔁 Move League
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="danger"
                                            onClick={() => handleDelete(t.id)}
                                        >
                                            🗑️
                                        </Button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            ))}

            {/* Move League Modal */}
            {moveTeamId && (
                <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
                    <div className="bg-white rounded-lg shadow-xl p-6 w-80 space-y-3">
                        <h3 className="text-lg font-bold text-gray-900">Move Team To:</h3>
                        <div className="space-y-2">
                            {LEAGUE_OPTIONS.map((league) => (
                                <Button
                                    key={league}
                                    className="w-full justify-start"
                                    variant="outline"
                                    onClick={() => assignLeague(moveTeamId, league)}
                                >
                                    🏆 {league}
                                </Button>
                            ))}
                            <Button
                                variant="danger"
                                className="w-full mt-2"
                                onClick={() => assignLeague(moveTeamId, null)}
                            >
                                ❌ Remove from League
                            </Button>
                            <Button
                                variant="outline"
                                className="w-full mt-2"
                                onClick={() => setMoveTeamId(null)}
                            >
                                Cancel
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

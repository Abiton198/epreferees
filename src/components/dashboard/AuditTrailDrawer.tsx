import React, { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { fetchAuditTrail } from '@/services/appointments';
import type { AuditLog } from '@/types';
import { Loader2, ScrollText } from 'lucide-react';

interface Props {
  appointmentId: string | null;
  onClose: () => void;
}

const actionLabels: Record<string, string> = {
  CREATE_APPOINTMENT: 'Appointment Created',
  STATUS_ACCEPTED: 'Appointment Accepted',
  STATUS_REJECTED: 'Appointment Rejected',
  STATUS_COMPLETED: 'Marked Completed',
  UPDATE_FEEDBACK: 'Feedback Submitted',
  deleted: 'Appointment Archived',
  DELETE_APPOINTMENT: 'Appointment Archived',
};

const AuditTrailDrawer: React.FC<Props> = ({ appointmentId, onClose }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!appointmentId) return;
    setLoading(true);
    fetchAuditTrail(appointmentId)
      .then((data) => {
        console.log(
          "Audit actions:",
          data.map((x) => x.action)
        );

        const filteredLogs = data.filter(
          (log) =>
            log.action?.toLowerCase() !== "deleted" &&
            log.action !== "DELETE_APPOINTMENT"
        );

        setLogs(filteredLogs);
      })
      .finally(() => setLoading(false));
  }, [appointmentId]);

  return (
    <Sheet open={!!appointmentId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-[#006747]" />
            Audit Trail
          </SheetTitle>
        </SheetHeader>
        <div className="mt-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-[#006747]" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">No audit logs yet.</div>
          ) : (
            <ol className="relative border-l-2 border-[#006747]/20 ml-3 space-y-6">
              {logs.map((log) => {
                const isDeleted =
                  log.action?.toLowerCase() === "deleted" ||
                  log.action === "DELETE_APPOINTMENT";

                return (
                  <li
                    key={log.id}
                    className={`ml-6 transition-all ${isDeleted ? "opacity-50" : ""
                      }`}
                  >
                    {/* Timeline Dot */}
                    <div
                      className={`absolute -left-[9px] w-4 h-4 rounded-full border-2 border-white shadow ${isDeleted
                        ? "bg-red-400"
                        : "bg-[#006747]"
                        }`}
                    />

                    {/* Card */}
                    <div
                      className={`rounded-lg p-4 border shadow-sm transition-all ${isDeleted
                        ? "bg-red-50 border-red-200 grayscale"
                        : "bg-white border-gray-200"
                        }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className={`font-semibold text-sm ${isDeleted
                            ? "text-red-700 line-through"
                            : "text-gray-900"
                            }`}
                        >
                          {isDeleted
                            ? "Appointment Archived"
                            : actionLabels[log.action] || log.action}
                        </div>

                        <span
                          className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${isDeleted
                            ? "bg-red-100 text-red-600"
                            : "bg-gray-100 text-gray-600"
                            }`}
                        >
                          {log.actor_role}
                        </span>
                      </div>

                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default AuditTrailDrawer;

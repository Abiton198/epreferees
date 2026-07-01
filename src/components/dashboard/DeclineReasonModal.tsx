import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, XCircle } from 'lucide-react';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (reason: string) => void | Promise<void>;
    submitting?: boolean;
}

const DeclineReasonModal: React.FC<Props> = ({ open, onOpenChange, onConfirm, submitting = false }) => {
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');

    // Reset form each time the modal is freshly opened
    useEffect(() => {
        if (open) {
            setReason('');
            setError('');
        }
    }, [open]);

    const handleSubmit = async () => {
        const trimmed = reason.trim();
        if (!trimmed) {
            setError('A reason is required to decline this appointment.');
            return;
        }
        setError('');
        try {
            await onConfirm(trimmed);
        } catch {
            // Parent is expected to surface this (e.g. via toast).
            // Modal stays open so the typed reason isn't lost.
        }
    };

    return (
        <Dialog open={open} onOpenChange={(isOpen) => { if (!submitting) onOpenChange(isOpen); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                            <XCircle size={20} className="text-red-600" />
                        </div>
                        <DialogTitle className="text-base font-semibold text-slate-800">
                            Decline appointment
                        </DialogTitle>
                    </div>
                </DialogHeader>

                <p className="text-sm text-slate-500 leading-relaxed">
                    Please let the coach know why you're declining. A reason is required before this can be submitted.
                </p>

                <div className="mt-2">
                    <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
                        Reason for declining <span className="text-red-400 ml-0.5">*</span>
                    </Label>
                    <Textarea
                        value={reason}
                        onChange={(e) => {
                            setReason(e.target.value);
                            if (error) setError('');
                        }}
                        placeholder="e.g. Schedule conflict, travel distance, unavailable that day…"
                        rows={4}
                        disabled={submitting}
                        className={error ? 'border-red-400 focus-visible:ring-red-300' : ''}
                    />
                    {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
                </div>

                <div className="flex gap-3 mt-4">
                    <Button
                        variant="outline"
                        className="flex-1 border-slate-200 text-slate-600"
                        onClick={() => onOpenChange(false)}
                        disabled={submitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                        onClick={handleSubmit}
                        disabled={submitting}
                    >
                        {submitting
                            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting…</>
                            : 'Submit decline'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default DeclineReasonModal;
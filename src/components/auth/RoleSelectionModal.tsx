import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UserRound, Flag } from 'lucide-react';
import type { UserRole } from '@/types';

interface Props {
    open: boolean;
    onSelect: (role: UserRole) => void;
    onDismiss: () => void;
}

const RoleSelectionModal: React.FC<Props> = ({ open, onSelect, onDismiss }) => {
    return (
        <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onDismiss(); }}>
            <DialogContent className="sm:max-w-sm" onInteractOutside={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle className="text-xl font-semibold text-center text-[#006747]">
                        Welcome to EPRU
                    </DialogTitle>
                    <p className="text-sm text-center text-muted-foreground mt-1">
                        Tell us who you are so we can set up your account correctly.
                    </p>
                </DialogHeader>

                <div className="grid grid-cols-2 gap-3 mt-4">
                    <button
                        onClick={() => onSelect('coach')}
                        className="flex flex-col items-center gap-2 p-5 rounded-lg border border-gray-200 hover:border-emerald-500 hover:bg-emerald-50 transition-colors group"
                    >
                        <UserRound size={32} className="text-gray-400 group-hover:text-emerald-600 transition-colors" />
                        <span className="font-medium text-sm text-gray-700 group-hover:text-emerald-700">I'm a Coach</span>
                    </button>

                    <button
                        onClick={() => onSelect('referee')}
                        className="flex flex-col items-center gap-2 p-5 rounded-lg border border-gray-200 hover:border-emerald-500 hover:bg-emerald-50 transition-colors group"
                    >
                        <Flag size={32} className="text-gray-400 group-hover:text-emerald-600 transition-colors" />
                        <span className="font-medium text-sm text-gray-700 group-hover:text-emerald-700">I'm a Referee</span>
                    </button>
                </div>

                <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 text-muted-foreground w-full text-xs"
                    onClick={onDismiss}
                >
                    Skip — I'll complete my referee profile later
                </Button>
            </DialogContent>
        </Dialog>
    );
};

export default RoleSelectionModal;
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { Loader2, ChevronRight, ChevronLeft, Check } from 'lucide-react';

interface SetupProps {
    open: boolean;
    uid: string;
    onComplete: () => void;
}

const SetupProfileModal: React.FC<SetupProps> = ({ open, uid, onComplete }) => {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<any>({
        firstName: "", surname: "", gender: "", dob: "", idNumber: "",
        mobileNumber: "", city: "", yearJoined: new Date().getFullYear().toString(),
        experienceLevel: "Level 1", licenseNumber: "", boksmartNumber: "",
        shortSize: "", tshirtSize: "", jacketSize: "", bankName: "",
        accountNumber: "", branchCode: ""
    });

    const handleUpdate = (field: string, value: string) => {
        setFormData((prev: any) => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async () => {
        setLoading(true);
        try {
            const userRef = doc(db, "users", uid);
            await updateDoc(userRef, {
                ...formData,
                isNewUser: false, // Mark setup as complete
                updatedAt: serverTimestamp(),
            });
            onComplete();
        } catch (error) {
            console.error("Setup Error:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={() => { }}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        Step {step} of 4: {step === 1 ? 'Personal Info' : step === 2 ? 'Contact & Address' : step === 3 ? 'Referee Details' : 'Gear & Banking'}
                    </DialogTitle>
                    <div className="w-full bg-gray-100 h-1 mt-2 rounded-full overflow-hidden">
                        <div className="bg-[#006747] h-full transition-all" style={{ width: `${(step / 4) * 100}%` }} />
                    </div>
                </DialogHeader>

                <div className="space-y-4 py-4 min-h-[300px]">
                    {step === 1 && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><Label>First Name</Label><Input value={formData.firstName} onChange={e => handleUpdate('firstName', e.target.value)} /></div>
                            <div className="space-y-2"><Label>Surname</Label><Input value={formData.surname} onChange={e => handleUpdate('surname', e.target.value)} /></div>
                            <div className="space-y-2"><Label>ID Number</Label><Input value={formData.idNumber} onChange={e => handleUpdate('idNumber', e.target.value)} /></div>
                            <div className="space-y-2">
                                <Label>Gender</Label>
                                <Select onValueChange={v => handleUpdate('gender', v)}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                                    <SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem></SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4">
                            <div className="space-y-2"><Label>Mobile Number</Label><Input value={formData.mobileNumber} onChange={e => handleUpdate('mobileNumber', e.target.value)} /></div>
                            <div className="space-y-2"><Label>City / Town</Label><Input value={formData.city} onChange={e => handleUpdate('city', e.target.value)} /></div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><Label>BokSmart Number</Label><Input value={formData.boksmartNumber} onChange={e => handleUpdate('boksmartNumber', e.target.value)} /></div>
                            <div className="space-y-2">
                                <Label>Exp Level</Label>
                                <Select onValueChange={v => handleUpdate('experienceLevel', v)}><SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value="Level 1">Level 1</SelectItem><SelectItem value="Level 2">Level 2</SelectItem><SelectItem value="National">National</SelectItem></SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Jersey Size</Label>
                                <Select onValueChange={v => handleUpdate('refJerseySize', v)}><SelectTrigger><SelectValue placeholder="Size" /></SelectTrigger>
                                    <SelectContent><SelectItem value="S">Small</SelectItem><SelectItem value="M">Medium</SelectItem><SelectItem value="L">Large</SelectItem><SelectItem value="XL">XL</SelectItem></SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2"><Label>Bank Account</Label><Input value={formData.accountNumber} onChange={e => handleUpdate('accountNumber', e.target.value)} /></div>
                        </div>
                    )}
                </div>

                <DialogFooter className="flex justify-between sm:justify-between">
                    <Button variant="outline" onClick={() => setStep(s => s - 1)} disabled={step === 1 || loading}>
                        <ChevronLeft className="w-4 h-4 mr-2" /> Back
                    </Button>
                    {step < 4 ? (
                        <Button className="bg-[#006747]" onClick={() => setStep(s => s + 1)}>
                            Next <ChevronRight className="w-4 h-4 ml-2" />
                        </Button>
                    ) : (
                        <Button className="bg-emerald-600" onClick={handleSubmit} disabled={loading}>
                            {loading ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                            Complete Setup
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default SetupProfileModal;
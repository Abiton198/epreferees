import React, { useEffect, useState } from 'react';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { db, auth } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { Loader2, ChevronRight, ChevronLeft, Check } from 'lucide-react';

const sizes = ["XS", "S", "M", "L", "XL", "XXL"];
const banks = [
    // Major Banks
    "ABSA",
    "FNB (First National Bank)",
    "Standard Bank",
    "Nedbank",
    "Capitec",

    // Digital / New Banks
    "TymeBank",
    "Discovery Bank",
    "Bank Zero",

    // Mutual / Niche Banks
    "African Bank",
    "Bidvest Bank",
    "Investec",
    "Mercantile Bank",

    // Subsidiaries / Divisions
    "Ubank (Subsidiary of African Bank)",
    "Grindrod Bank",

    // Post / Government-linked
    "Postbank",

    // Business / Corporate (less common but useful)
    "Bidvest Bank Alliance",
    "Al Baraka Bank",

    // Other recognised institutions
    "Access Bank South Africa",
    "Citibank South Africa",
    "HSBC South Africa",
    "JP Morgan South Africa"
];
const accountTypes = ["Savings", "Cheque", "Transmission"];
const genders = ["Male", "Female"];
const races = ["African", "Coloured", "Indian", "White", "Other"];
const experienceLevels = ["Beginner", "Intermediate", "Advanced", "National"];

const SetupProfileModal = ({ open, uid, onComplete }: any) => {

    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<any>({});

    const [formData, setFormData] = useState<any>({
        firstName: "", surname: "", preferredName: "",
        gender: "", dob: "", idNumber: "", nationality: "South African", race: "",
        email: "", mobileNumber: "", altContact: "",
        residentialAddress: "", postalAddress: "", city: "",
        experienceLevel: "", yearJoined: "",
        boksmartNumber: "", boksmartExpiry: "",
        refJerseySize: "", tshirtSize: "", golfShirtSize: "",
        jacketSize: "", shortSize: "", tracksuitTopSize: "", tracksuitBottomSize: "",
        bankName: "", accountHolder: "", accountNumber: "", accountType: "", branchCode: "",
        role: "referee", status: "pending", approved: false
    });

    const handleUpdate = (field: string, value: string) => {
        setFormData((prev: any) => ({ ...prev, [field]: value }));
    };

    // ✅ AUTO-FILL (Auth + Firestore)
    useEffect(() => {
        const loadUser = async () => {
            if (!uid) return;

            const user = auth.currentUser;
            if (user?.email) {
                handleUpdate("email", user.email);
            }

            const docRef = doc(db, "users", uid);
            const snap = await getDoc(docRef);

            if (snap.exists()) {
                setFormData((prev: any) => ({
                    ...prev,
                    ...snap.data()
                }));
            }
        };

        loadUser();
    }, [uid]);

    // ✅ VALIDATION PER STEP
    const validateStep = () => {
        let newErrors: any = {};

        if (step === 1) {
            if (!formData.firstName) newErrors.firstName = "Required";
            if (!formData.surname) newErrors.surname = "Required";
            if (!formData.idNumber) newErrors.idNumber = "Required";
            if (!formData.gender) newErrors.gender = "Required";
        }

        if (step === 2) {
            if (!formData.email) newErrors.email = "Required";
            if (!formData.mobileNumber) newErrors.mobileNumber = "Required";
            if (!formData.city) newErrors.city = "Required";
        }

        if (step === 3) {
            if (!formData.experienceLevel) newErrors.experienceLevel = "Required";
            if (!formData.yearJoined) newErrors.yearJoined = "Required";
        }

        if (step === 5) {
            if (!formData.bankName) newErrors.bankName = "Required";
            if (!formData.accountNumber) newErrors.accountNumber = "Required";
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleNext = () => {
        if (!validateStep()) return;
        setStep((s: number) => s + 1);
    };

    const handleSubmit = async () => {
        if (!validateStep()) return;

        setLoading(true);
        try {
            const ref = doc(db, "users", uid);

            await updateDoc(ref, {
                ...formData,
                displayName: `${formData.firstName} ${formData.surname}`,
                lastEdited: serverTimestamp(),
                isNewUser: false
            });

            onComplete();
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const renderError = (field: string) =>
        errors[field] && <p className="text-red-500 text-xs">{errors[field]}</p>;

    return (
        <Dialog open={open}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Step {step} of 5</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">

                    {/* STEP 1 */}
                    {step === 1 && (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>First Name</Label>
                                <Input value={formData.firstName} onChange={e => handleUpdate("firstName", e.target.value)} />
                                {renderError("firstName")}
                            </div>

                            <div>
                                <Label>Surname</Label>
                                <Input value={formData.surname} onChange={e => handleUpdate("surname", e.target.value)} />
                                {renderError("surname")}
                            </div>

                            <div>
                                <Label>ID Number</Label>
                                <Input value={formData.idNumber} onChange={e => handleUpdate("idNumber", e.target.value)} />
                                {renderError("idNumber")}
                            </div>

                            <div>
                                <Label>Gender</Label>
                                <Select onValueChange={v => handleUpdate("gender", v)}>
                                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                                    <SelectContent>
                                        {genders.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                {renderError("gender")}
                            </div>
                        </div>
                    )}

                    {/* STEP 2 */}
                    {step === 2 && (
                        <>
                            <div>
                                <Label>Email</Label>
                                <Input value={formData.email} disabled />
                                {renderError("email")}
                            </div>

                            <div>
                                <Label>Mobile</Label>
                                <Input value={formData.mobileNumber} onChange={e => handleUpdate("mobileNumber", e.target.value)} />
                                {renderError("mobileNumber")}
                            </div>

                            <div>
                                <Label>City</Label>
                                <Input value={formData.city} onChange={e => handleUpdate("city", e.target.value)} />
                                {renderError("city")}
                            </div>
                        </>
                    )}

                    {/* STEP 3 */}
                    {step === 3 && (
                        <>
                            <Label>Experience</Label>
                            <Select onValueChange={v => handleUpdate("experienceLevel", v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {experienceLevels.map(e => (
                                        <SelectItem key={e} value={e}>{e}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {renderError("experienceLevel")}

                            <Label>Year Joined</Label>
                            <Input value={formData.yearJoined} onChange={e => handleUpdate("yearJoined", e.target.value)} />
                            {renderError("yearJoined")}
                        </>
                    )}

                    {/* STEP 4 */}
                    {step === 4 && (
                        <div className="grid grid-cols-2 gap-3">
                            {["refJerseySize", "tshirtSize", "golfShirtSize", "jacketSize", "shortSize"]
                                .map(field => (
                                    <Select key={field} onValueChange={v => handleUpdate(field, v)}>
                                        <SelectTrigger><SelectValue placeholder={field} /></SelectTrigger>
                                        <SelectContent>
                                            {sizes.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                ))}
                        </div>
                    )}

                    {/* STEP 5 */}
                    {step === 5 && (
                        <>
                            <Label>Bank</Label>
                            <Select onValueChange={v => handleUpdate("bankName", v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {banks.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            {renderError("bankName")}

                            <Label>Account Number</Label>
                            <Input value={formData.accountNumber} onChange={e => handleUpdate("accountNumber", e.target.value)} />
                            {renderError("accountNumber")}

                            <Label>Account Type</Label>
                            <Select onValueChange={v => handleUpdate("accountType", v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {accountTypes.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </>
                    )}

                </div>

                <DialogFooter className="flex justify-between">
                    <Button disabled={step === 1} onClick={() => setStep((s: number) => s - 1)}>
                        <ChevronLeft className="w-4 h-4 mr-2" /> Back
                    </Button>

                    {step < 5 ? (
                        <Button onClick={handleNext}>
                            Next <ChevronRight className="w-4 h-4 ml-2" />
                        </Button>
                    ) : (
                        <Button onClick={handleSubmit} disabled={loading}>
                            {loading ? <Loader2 className="animate-spin" /> : <Check />}
                            Complete
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default SetupProfileModal;
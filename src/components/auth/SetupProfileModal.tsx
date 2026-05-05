import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db, auth } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { 
  Loader2, ChevronRight, ChevronLeft, Check, 
  User, Phone, Shield, Shirt, CreditCard, MapPin, CheckCircle2 
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────
const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const BANKS = [
  "ABSA", "FNB (First National Bank)", "Standard Bank", "Nedbank", "Capitec",
  "TymeBank", "Discovery Bank", "Bank Zero", "African Bank", "Bidvest Bank",
  "Investec", "Mercantile Bank", "Ubank (Subsidiary of African Bank)",
  "Grindrod Bank", "Postbank", "Bidvest Bank Alliance", "Al Baraka Bank",
  "Access Bank South Africa", "Citibank South Africa",
  "HSBC South Africa", "JP Morgan South Africa",
];
const ACCOUNT_TYPES = ["Savings", "Cheque", "Transmission"];
const GENDERS = ["Male", "Female", "Prefer not to say"];
const RACES = ["African", "Coloured", "Indian", "White", "Other"];
const EXPERIENCE_LEVELS = ["Beginner", "Intermediate", "Advanced", "National"];
const NATIONALITIES = [
  "South African", "Zimbabwean", "Namibian", "Botswanan",
  "Zambian", "Mozambican", "Lesotho", "Swazi", "Other",
];

// ─── Step config ─────────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: "Personal",   icon: User },
  { id: 2, label: "Contact",    icon: Phone },
  { id: 3, label: "Address",    icon: MapPin },
  { id: 4, label: "Rugby",      icon: Shield },
  { id: 5, label: "Kit Sizes",  icon: Shirt },
  { id: 6, label: "Banking",    icon: CreditCard },
];

// ─── Empty form ───────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  firstName: "", surname: "", preferredName: "",
  gender: "", dob: "", idNumber: "",
  nationality: "South African", race: "",
  email: "", mobileNumber: "", altContact: "",
  residentialAddress: "", postalAddress: "", city: "",
  experienceLevel: "", yearJoined: "",
  boksmartNumber: "", boksmartExpiry: "",
  refJerseySize: "", tshirtSize: "", golfShirtSize: "",
  jacketSize: "", shortSize: "", tracksuitTopSize: "", tracksuitBottomSize: "",
  bankName: "", accountHolder: "", accountNumber: "",
  accountType: "", branchCode: "",
  role: "referee", status: "active", approved: true,
};

// ─── Helper Components (Moved Outside to prevent Focus Loss) ──────────────────

const Field = ({ label, field, formData, set, errors, type = "text", disabled = false, placeholder = "" }: any) => (
  <div>
    <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">{label}</Label>
    <Input
      type={type}
      value={formData[field] || ""}
      onChange={e => set(field, e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className={`border-slate-200 focus:border-[#006747] focus:ring-1 focus:ring-[#006747]/20 ${errors[field] ? 'border-red-400' : ''}`}
    />
    {errors[field] && <p className="text-red-500 text-xs mt-0.5">{errors[field]}</p>}
  </div>
);

const SizeSelect = ({ label, field, formData, set }: any) => (
  <div>
    <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">{label}</Label>
    <Select value={formData[field] || ""} onValueChange={v => set(field, v)}>
      <SelectTrigger className="border-slate-200 focus:border-[#006747]">
        <SelectValue placeholder="Select size" />
      </SelectTrigger>
      <SelectContent>
        {SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>
);

const Dropdown = ({ label, field, options, formData, set, errors, required = false }: any) => (
  <div>
    <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
      {label}{required && <span className="text-red-400 ml-0.5">*</span>}
    </Label>
    <Select value={formData[field] || ""} onValueChange={v => set(field, v)}>
      <SelectTrigger className={`border-slate-200 focus:border-[#006747] ${errors[field] ? 'border-red-400' : ''}`}>
        <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o: string) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
    {errors[field] && <p className="text-red-500 text-xs mt-0.5">{errors[field]}</p>}
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────
const SetupProfileModal = ({ open, uid, onComplete }: {
  open: boolean;
  uid: string;
  onComplete: () => void;
}) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<any>({ ...EMPTY_FORM });

  useEffect(() => {
    if (!uid) return;
    const load = async () => {
      const user = auth.currentUser;
      if (user?.email) {
        setFormData((p: any) => ({ ...p, email: user.email }));
      }
      if (user?.displayName) {
        const parts = user.displayName.trim().split(' ');
        setFormData((p: any) => ({
          ...p,
          firstName: parts[0] || '',
          surname: parts.slice(1).join(' ') || '',
        }));
      }
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        setFormData((p: any) => ({ ...p, ...snap.data() }));
      }
    };
    load();
  }, [uid]);

  const set = (field: string, value: string) =>
    setFormData((p: any) => ({ ...p, [field]: value }));

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (step === 1) {
      if (!formData.firstName?.trim()) e.firstName = "Required";
      if (!formData.surname?.trim())   e.surname   = "Required";
      if (!formData.idNumber?.trim())  e.idNumber  = "Required";
      if (!formData.gender)            e.gender    = "Required";
    }
    if (step === 2) {
      if (!formData.email?.trim())        e.email        = "Required";
      if (!formData.mobileNumber?.trim()) e.mobileNumber = "Required";
    }
    if (step === 3) {
      if (!formData.city?.trim()) e.city = "Required";
    }
    if (step === 4) {
      if (!formData.experienceLevel) e.experienceLevel = "Required";
      if (!formData.yearJoined?.trim()) e.yearJoined  = "Required";
    }
    if (step === 6) {
      if (!formData.bankName)              e.bankName      = "Required";
      if (!formData.accountNumber?.trim()) e.accountNumber = "Required";
      if (!formData.accountHolder?.trim()) e.accountHolder = "Required";
      if (!formData.accountType)           e.accountType   = "Required";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => { if (validate()) setStep(s => s + 1); };
  const handleBack = () => { setErrors({}); setStep(s => s - 1); };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, "users", uid), {
        ...formData,
        full_name: `${formData.firstName} ${formData.surname}`.trim(),
        displayName: formData.preferredName?.trim() || `${formData.firstName} ${formData.surname}`.trim(),
        lastEdited: serverTimestamp(),
        isNewUser: false,
        status: "active",
        approved: true,
      });
      onComplete();
    } catch (err) {
      console.error("Profile update error:", err);
    } finally {
      setLoading(false);
    }
  };

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#006747] to-[#009060] px-6 pt-6 pb-4">
          <DialogTitle className="text-white text-xl font-bold tracking-tight">
            Complete Your Profile
          </DialogTitle>
          <p className="text-emerald-200 text-sm mt-0.5">
            Step {step} of {STEPS.length} — {STEPS[step - 1].label}
          </p>
          <div className="mt-4 h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-3">
            {STEPS.map(s => {
              const Icon = s.icon;
              const done = step > s.id;
              const active = step === s.id;
              return (
                <div key={s.id} className="flex flex-col items-center gap-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-all
                    ${done ? 'bg-white text-[#006747]' : active ? 'bg-white/30 text-white ring-2 ring-white' : 'bg-white/10 text-white/50'}`}>
                    {done ? <CheckCircle2 size={14} /> : <Icon size={13} />}
                  </div>
                  <span className={`text-[9px] font-semibold uppercase tracking-wide hidden sm:block
                    ${active ? 'text-white' : done ? 'text-emerald-300' : 'text-white/40'}`}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Form body */}
        <div className="px-6 py-5 max-h-[55vh] overflow-y-auto space-y-4">
          {step === 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="First Name *" field="firstName" formData={formData} set={set} errors={errors} />
              <Field label="Surname *" field="surname" formData={formData} set={set} errors={errors} />
              <Field label="Preferred Name" field="preferredName" formData={formData} set={set} errors={errors} placeholder="What you go by" />
              <Dropdown label="Gender" field="gender" options={GENDERS} formData={formData} set={set} errors={errors} required />
              <Field label="Date of Birth" field="dob" formData={formData} set={set} errors={errors} type="date" />
              <Field label="ID Number *" field="idNumber" formData={formData} set={set} errors={errors} placeholder="13-digit SA ID" />
              <Dropdown label="Nationality" field="nationality" options={NATIONALITIES} formData={formData} set={set} errors={errors} />
              <Dropdown label="Race" field="race" options={RACES} formData={formData} set={set} errors={errors} />
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Field label="Email *" field="email" formData={formData} set={set} errors={errors} type="email" disabled />
                <p className="text-xs text-slate-400 mt-1">Email is linked to your account and cannot be changed here.</p>
              </div>
              <Field label="Mobile Number *" field="mobileNumber" formData={formData} set={set} errors={errors} placeholder="e.g. 082 000 0000" />
              <Field label="Alternative Contact" field="altContact" formData={formData} set={set} errors={errors} placeholder="Optional" />
            </div>
          )}

          {step === 3 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Field label="Residential Address" field="residentialAddress" formData={formData} set={set} errors={errors} placeholder="Street address" />
              </div>
              <div className="sm:col-span-2">
                <Field label="Postal Address" field="postalAddress" formData={formData} set={set} errors={errors} placeholder="If different from residential" />
              </div>
              <Field label="City / Town *" field="city" formData={formData} set={set} errors={errors} placeholder="e.g. Port Elizabeth" />
            </div>
          )}

          {step === 4 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Dropdown label="Experience Level" field="experienceLevel" options={EXPERIENCE_LEVELS} formData={formData} set={set} errors={errors} required />
              <Field label="Year Joined *" field="yearJoined" formData={formData} set={set} errors={errors} placeholder="e.g. 2019" />
              <Field label="BokSmart Number" field="boksmartNumber" formData={formData} set={set} errors={errors} placeholder="BS-000000" />
              <Field label="BokSmart Expiry" field="boksmartExpiry" formData={formData} set={set} errors={errors} type="date" />
            </div>
          )}

          {step === 5 && (
            <>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 mb-2">
                Select your kit sizes so the association can order the correct gear for you.
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <SizeSelect label="Referee Jersey" field="refJerseySize" formData={formData} set={set} />
                <SizeSelect label="T-Shirt" field="tshirtSize" formData={formData} set={set} />
                <SizeSelect label="Golf Shirt" field="golfShirtSize" formData={formData} set={set} />
                <SizeSelect label="Jacket" field="jacketSize" formData={formData} set={set} />
                <SizeSelect label="Shorts" field="shortSize" formData={formData} set={set} />
                <SizeSelect label="Tracksuit Top" field="tracksuitTopSize" formData={formData} set={set} />
                <SizeSelect label="Tracksuit Bottom" field="tracksuitBottomSize" formData={formData} set={set} />
              </div>
            </>
          )}

          {step === 6 && (
            <>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 mb-2">
                🔒 Banking details are used for match payments. This information is stored securely.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Dropdown label="Bank Name" field="bankName" options={BANKS} formData={formData} set={set} errors={errors} required />
                </div>
                <Field label="Account Holder Name *" field="accountHolder" formData={formData} set={set} errors={errors} placeholder="As it appears on account" />
                <Field label="Account Number *" field="accountNumber" formData={formData} set={set} errors={errors} placeholder="Numbers only" />
                <Dropdown label="Account Type" field="accountType" options={ACCOUNT_TYPES} formData={formData} set={set} errors={errors} required />
                <Field label="Branch Code" field="branchCode" formData={formData} set={set} errors={errors} placeholder="e.g. 051001" />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
          <Button
            variant="outline"
            disabled={step === 1}
            onClick={handleBack}
            className="border-slate-200 text-slate-600"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <span className="text-xs text-slate-400 font-medium">
            {step} / {STEPS.length}
          </span>
          {step < STEPS.length ? (
            <Button onClick={handleNext} className="bg-[#006747] hover:bg-[#004d35] px-6">
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading} className="bg-[#006747] hover:bg-[#004d35] px-8">
              {loading
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
                : <><Check className="w-4 h-4 mr-2" /> Complete Profile</>
              }
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SetupProfileModal;
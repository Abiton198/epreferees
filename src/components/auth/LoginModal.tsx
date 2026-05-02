import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/use-toast';
import { Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import type { UserRole } from '@/types';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { useNavigate } from 'react-router-dom';
import { db, auth } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LoginModal: React.FC<Props> = ({ open, onOpenChange }) => {
  const { signIn, signUp } = useAuth(); // Assuming these exist in your context
  const navigate = useNavigate();

  // UI State
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('coach');

  /**
   * Helper: Handles post-auth logic for existing or new users
   */
  const handleUserRouting = async (firebaseUser: any, isRegistering: boolean) => {
    console.log("🔥 handleUserRouting called", { uid: firebaseUser?.uid, isRegistering });

    if (!firebaseUser?.uid) {
      console.error("❌ No firebaseUser or uid!");
      return;
    }

    const userRef = doc(db, "users", firebaseUser.uid);
    const snap = await getDoc(userRef);
    console.log("📄 Firestore snap exists:", snap.exists(), snap.data());

    if (snap.exists()) {
      const data = snap.data();
      console.log("👤 User data:", data);
      console.log("🔀 isRegistering:", isRegistering);

      if (isRegistering) {
        setTab('login');
        setStatusMessage("You are already a member! Please sign in below.");
        return;
      }

      console.log("✅ Routing to:", `/dashboard/${data.role}`);
      if (data.approved || data.role === 'coach' || data.role === 'referee') {
        await updateDoc(userRef, { lastLogin: serverTimestamp() });
        navigate(`/dashboard/${data.role}`);
        onOpenChange(false);
      } else {
        console.warn("⛔ Not approved");
        setStatusMessage("Your account is pending executive approval.");
        await signOut(auth);
      }
    } else {
      console.log("🆕 No doc found, isRegistering:", isRegistering);
      if (!isRegistering) {
        setStatusMessage("No account found. Please register first.");
        await signOut(auth);
        return;
      }

      await setDoc(userRef, {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        full_name: fullName || firebaseUser.displayName || "",
        role: role,
        isNewUser: true,
        status: "active",
        approved: true,
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
      });

      console.log("✅ New user created, navigating to:", `/dashboard/${role}`);
      navigate(`/dashboard/${role}`);
      onOpenChange(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setStatusMessage(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      await handleUserRouting(result.user, tab === 'signup');
    } catch (err: any) {
      toast({ title: "Auth Error", description: err.message, variant: "destructive" });
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMessage(null);
    try {
      const result = await signIn(email, password);
      await handleUserRouting(result.user, false);
    } catch (err: any) {
      toast({ title: 'Login failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMessage(null);
    try {
      const result = await signUp(email, password, fullName, role);
      await handleUserRouting(result.user, true);
    } catch (err: any) {
      toast({ title: 'Signup failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center text-[#006747]">
            EPRU Referee Portal
          </DialogTitle>
        </DialogHeader>

        {statusMessage && (
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-md flex items-center gap-2 text-sm text-amber-800">
            <AlertCircle size={16} />
            {statusMessage}
          </div>
        )}

        <Tabs value={tab} onValueChange={(v) => { setTab(v as any); setStatusMessage(null); }}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Sign In</TabsTrigger>
            <TabsTrigger value="signup">Register</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <form onSubmit={handleLogin} className="space-y-4 mt-4">
              <div>
                <Label>Email</Label>
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <Label>Password</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-2 text-gray-500">
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <Button className="w-full bg-[#006747] hover:bg-[#004d35]" disabled={loading}>
                {loading && <Loader2 className="mr-2 animate-spin text-white" size={16} />}
                Sign In
              </Button>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-gray-500">Or</span></div>
              </div>
              <Button type="button" variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={googleLoading}>
                {googleLoading ? <Loader2 className="mr-2 animate-spin" size={16} /> : null}
                Continue with Google
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={handleSignup} className="space-y-4 mt-4">
              <div>
                <Label>Full Name</Label>
                <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <Label>Password</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-2 text-gray-500">
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div>
                <Label>I am a:</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setRole('coach')}
                    className={`p-2 text-sm rounded border transition-colors ${role === 'coach' ? 'bg-emerald-50 border-emerald-600 text-emerald-700' : 'border-gray-200'}`}
                  >
                    Coach
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('referee')}
                    className={`p-2 text-sm rounded border transition-colors ${role === 'referee' ? 'bg-emerald-50 border-emerald-600 text-emerald-700' : 'border-gray-200'}`}
                  >
                    Referee
                  </button>
                </div>
              </div>
              <Button className="w-full bg-[#006747] hover:bg-[#004d35]" disabled={loading}>
                {loading && <Loader2 className="mr-2 animate-spin" size={16} />}
                Create Account
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={googleLoading}>
                {googleLoading ? <Loader2 className="mr-2 animate-spin" size={16} /> : null}
                Register with Google
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default LoginModal;
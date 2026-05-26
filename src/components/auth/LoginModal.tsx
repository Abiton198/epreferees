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
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import SetupProfileModal from './SetupProfileModal';
import RoleSelectionModal from './RoleSelectionModal';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// What "incomplete" means:
//   - No Firestore doc at all (auth exists, doc missing — edge case)
//   - Doc exists but profileIncomplete === true
//   - Doc exists but isNewUser === true  (legacy / skipped-setup path)
//   - Doc exists but role is missing entirely
//
// Incomplete flow:
//   1. If no role stored → show RoleSelectionModal
//   2. If role === 'referee' (or just became referee) → show SetupProfileModal
//   3. If role === 'coach' → send straight to coach dashboard
//      (coaches have no extra setup step; add one here if that changes)
// ---------------------------------------------------------------------------

const LoginModal: React.FC<Props> = ({ open, onOpenChange }) => {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  // ── UI state ──────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // ── Form state ────────────────────────────────────────────────────────────
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  // ── Post-auth modal state ─────────────────────────────────────────────────
  const [showRoleSelection, setShowRoleSelection] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  // pendingUser holds whichever shape we have at that point in the flow
  const [pendingUser, setPendingUser] = useState<any>(null);

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Open the role picker, storing what we know about the user so far. */
  const openRolePicker = (userSnapshot: any) => {
    setPendingUser(userSnapshot);
    setShowRoleSelection(true);
  };

  /** Open the referee profile-setup modal. */
  const openSetup = (userSnapshot: any) => {
    setPendingUser(userSnapshot);
    setShowSetup(true);
  };

  /** Navigate to the correct dashboard and close the login modal. */
  const goToDashboard = (role: UserRole) => {
    navigate(`/dashboard/${role}`);
    onOpenChange(false);
  };

  // ── Core routing decision ─────────────────────────────────────────────────
  /**
   * Single entry point after any successful Firebase auth.
   * Reads (or creates) the Firestore doc and decides what to show next.
   */
  const handleUserRouting = async (
    firebaseUser: any,
    isNewRegistration: boolean,
  ) => {
    if (!firebaseUser?.uid) return;

    const userRef = doc(db, 'users', firebaseUser.uid);
    const snap = await getDoc(userRef);

    // ── Case 1: No Firestore doc at all ──────────────────────────────────────
    // Could be a brand-new signup OR a returning auth user whose doc was lost.
    if (!snap.exists()) {
      if (isNewRegistration) {
        // New user — write a skeletal doc so the UID is claimed, then ask role
        const skeleton = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          full_name: fullName || firebaseUser.displayName || '',
          role: null,          // intentionally null until role picker resolves
          isNewUser: true,
          profileIncomplete: true,
          status: 'active',
          approved: true,
          createdAt: serverTimestamp(),
        };
        await setDoc(userRef, skeleton);
        openRolePicker({ ...skeleton, uid: firebaseUser.uid });
      } else {
        // Sign-in with no doc — treat as incomplete new user
        openRolePicker({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          full_name: firebaseUser.displayName || '',
          role: null,
          isNewUser: true,
          profileIncomplete: true,
        });
      }
      return;
    }

    // ── Case 2: Doc exists ───────────────────────────────────────────────────
    const data = snap.data();

    // 2a. No role set at all → must pick one
    if (!data.role) {
      openRolePicker(data);
      return;
    }

    // 2b. Role is set but profile is still incomplete — always go to setup
    if (data.profileIncomplete || data.isNewUser) {
      openSetup(data);
      return;
    }

    // 2c. Everything is in order → route normally
    goToDashboard(data.role as UserRole);
  };

  // ── Role selection callback ───────────────────────────────────────────────
  /**
   * Called when the user picks a role, or skips (defaults to 'referee').
   * Updates Firestore and then continues the appropriate sub-flow.
   */
  const handleRoleChosen = async (role: UserRole, skipped = false) => {
    setShowRoleSelection(false);
    if (!pendingUser) return;

    const userRef = doc(db, 'users', pendingUser.uid);

    // Both roles require profile setup — mark incomplete until SetupProfileModal completes.
    // If skipped, role defaults to 'referee' and setup is still required.
    await updateDoc(userRef, {
      role,
      isNewUser: true,
      profileIncomplete: true,
    });

    // Always push into profile setup regardless of role
    openSetup({ ...pendingUser, role });
  };

  // ── Setup completion callback ─────────────────────────────────────────────
  const handleSetupComplete = async () => {
    if (!pendingUser?.uid) return;
    await updateDoc(doc(db, 'users', pendingUser.uid), {
      isNewUser: false,
      profileIncomplete: false,
    });
    setShowSetup(false);
    goToDashboard((pendingUser.role ?? 'referee') as UserRole);
  };

  // ── Auth handlers ─────────────────────────────────────────────────────────
  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setStatusMessage(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      // Google sign-in could be a new user or a returning one —
      // handleUserRouting checks the doc to decide.
      await handleUserRouting(result.user, tab === 'signup');
    } catch (err: any) {
      toast({ title: 'Auth error', description: err.message, variant: 'destructive' });
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
      // isNewRegistration = false for a sign-in, but handleUserRouting will
      // still catch incomplete profiles via the doc flags.
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
      // Pass a throwaway role here — it gets overwritten after role picker.
      const result = await signUp(email, password, fullName, 'referee');
      await handleUserRouting(result.user, true);
    } catch (err: any) {
      toast({ title: 'Signup failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
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

            {/* ── Sign in tab ─────────────────────────────────────────────── */}
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
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-2 text-gray-500"
                    >
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
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-gray-500">Or</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleGoogleSignIn}
                  disabled={googleLoading}
                >
                  {googleLoading && <Loader2 className="mr-2 animate-spin" size={16} />}
                  Continue with Google
                </Button>
              </form>
            </TabsContent>

            {/* ── Register tab ────────────────────────────────────────────── */}
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
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-2 text-gray-500"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <Button className="w-full bg-[#006747] hover:bg-[#004d35]" disabled={loading}>
                  {loading && <Loader2 className="mr-2 animate-spin" size={16} />}
                  Create Account
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleGoogleSignIn}
                  disabled={googleLoading}
                >
                  {googleLoading && <Loader2 className="mr-2 animate-spin" size={16} />}
                  Register with Google
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Role picker — fires for new users AND returning users with no role */}
      <RoleSelectionModal
        open={showRoleSelection}
        onSelect={(role) => handleRoleChosen(role, false)}
        onDismiss={() => handleRoleChosen('referee', true)}
      />

      {/* Referee profile setup — fires whenever a referee's profile is incomplete */}
      {showSetup && pendingUser && (
        <SetupProfileModal
          open={showSetup}
          uid={pendingUser.uid}
          onComplete={handleSetupComplete}
        />
      )}
    </>
  );
};

export default LoginModal;
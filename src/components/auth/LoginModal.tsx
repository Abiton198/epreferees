import React, { useState, useEffect } from 'react';
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
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, where, getDocs, limit } from 'firebase/firestore';
import SetupProfileModal from './SetupProfileModal';
import RoleSelectionModal from './RoleSelectionModal';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Stage = 'auth' | 'role-select' | 'setup' | 'done';

const LoginModal: React.FC<Props> = ({ open, onOpenChange }) => {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [selectedRole, setSelectedRole] = useState<'coach' | 'referee'>('referee');

  const [stage, setStage] = useState<Stage>('auth');
  const [pendingUser, setPendingUser] = useState<any>(null);

  useEffect(() => {
    if (open) {
      setStage('auth');
      setTab('login');
      setEmail('');
      setPassword('');
      setFullName('');
      setSelectedRole('referee');
      setStatusMessage(null);
      setPendingUser(null);
    }
  }, [open]);

  const openRolePicker = (userSnapshot: any) => {
    setPendingUser(userSnapshot);
    setStage('role-select');
  };

  const openSetup = (userSnapshot: any) => {
    setPendingUser(userSnapshot);
    setStage('setup');
  };

  /** Maps user roles & executive flags to exact App.tsx routes */
  const goToDashboard = (role: UserRole | string, isExecutive = false) => {
    setStage('done');
    onOpenChange(false);

    if (isExecutive || role === 'executive' || role === 'exco') {
      navigate('/dashboard/exco');
      return;
    }

    if (role === 'coach') {
      navigate('/dashboard/coach');
      return;
    }

    navigate('/dashboard/referee');
  };

  /** Look for a legacy profile: by doc ID first, then by uid/email fields. */
  const findLegacyProfile = async (uid: string, email: string | null) => {
    const sources: { col: string; role: UserRole }[] = [
      { col: 'executives', role: 'executive' as UserRole },
      { col: 'coaches', role: 'coach' },
      { col: 'referees', role: 'referee' },
    ];

    for (const src of sources) {
      try {
        const snap = await getDoc(doc(db, src.col, uid));
        if (snap.exists()) {
          return { ...snap.data(), role: src.role, sourceCollection: src.col };
        }
      } catch { /* denied or missing — keep looking */ }

      try {
        const byUid = await getDocs(query(
          collection(db, src.col), where('uid', '==', uid), limit(1)
        ));
        if (!byUid.empty) {
          return { ...byUid.docs[0].data(), role: src.role, sourceCollection: src.col };
        }
      } catch { /* keep looking */ }

      if (email) {
        try {
          const byEmail = await getDocs(query(
            collection(db, src.col), where('email', '==', email), limit(1)
          ));
          if (!byEmail.empty) {
            return { ...byEmail.docs[0].data(), role: src.role, sourceCollection: src.col };
          }
        } catch { /* keep looking */ }
      }
    }
    return null;
  };

  const handleUserRouting = async (
    firebaseUser: any,
    isNewRegistration: boolean,
    intendedRole: UserRole | null = null,
  ) => {
    if (!firebaseUser?.uid) return;

    try {
      const userRef = doc(db, 'users', firebaseUser.uid);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        if (!isNewRegistration) {
          const legacy: any = await findLegacyProfile(firebaseUser.uid, firebaseUser.email);

          if (legacy) {
            const legacyExec = legacy.role === 'executive' || legacy.isExecutive === true;
            const migrated = {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              full_name:
                legacy.full_name || legacy.name ||
                firebaseUser.displayName || '',
              role: legacy.role,
              ...(legacyExec ? { isExecutive: true } : {}),
              isNewUser: false,
              profileIncomplete: false,
              status: 'active',
              approved: true,
              migratedFrom: legacy.sourceCollection,
              createdAt: serverTimestamp(),
            };

            await setDoc(userRef, migrated);
            goToDashboard(legacy.role, legacyExec);
            return;
          }

          toast({
            title: 'Profile data not found',
            description:
              'Your account exists but no profile document was found in users, coaches, referees, or executives. Check the Firebase console for this UID, or that the app is pointed at the right project.',
            variant: 'destructive',
          });
          console.warn('[LoginModal] No profile found for UID:', firebaseUser.uid);
          return;
        }

        const isCoach = intendedRole === 'coach';

        const skeleton = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          full_name: fullName || firebaseUser.displayName || '',
          role: intendedRole,
          isNewUser: !isCoach,
          profileIncomplete: !isCoach,
          ...(isCoach ? { setupCompleted: true } : {}),
          status: 'active',
          approved: true,
          createdAt: serverTimestamp(),
        };

        await setDoc(userRef, skeleton);

        if (isCoach) {
          goToDashboard('coach');
        } else if (intendedRole === 'referee') {
          openSetup(skeleton);
        } else {
          openRolePicker(skeleton);
        }
        return;
      }

      const data = snap.data();
      const userIsExec =
        data.isExecutive === true || data.role === 'executive' || data.role === 'exco';

      // Route executives / exco committee members first
      if (userIsExec) {
        goToDashboard(data.role || 'executive', true);
        return;
      }

      if (!data.role) {
        openRolePicker(data);
        return;
      }

      if (data.role === 'coach') {
        if (data.profileIncomplete || data.isNewUser) {
          await updateDoc(userRef, {
            profileIncomplete: false,
            isNewUser: false,
          });
        }
        goToDashboard('coach');
        return;
      }

      if (data.role === 'referee' && (data.profileIncomplete || data.isNewUser)) {
        openSetup(data);
        return;
      }

      goToDashboard(data.role as UserRole);
    } catch (error: any) {
      toast({ title: 'Routing Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleRoleChosen = async (role: UserRole, skipped = false) => {
    if (!pendingUser) {
      console.warn('[LoginModal] handleRoleChosen aborted: pendingUser is null');
      return;
    }

    const userRef = doc(db, 'users', pendingUser.uid);

    try {
      if (role === 'coach') {
        await updateDoc(userRef, {
          role: 'coach',
          isNewUser: false,
          profileIncomplete: false,
          setupCompleted: true,
        });
        goToDashboard('coach');
      } else {
        await updateDoc(userRef, {
          role,
          isNewUser: true,
          profileIncomplete: true,
        });
        openSetup({ ...pendingUser, role });
      }
    } catch (error: any) {
      toast({ title: 'Could not save role', description: error.message, variant: 'destructive' });
      setStage('role-select');
    }
  };

  const handleSetupComplete = async () => {
    if (!pendingUser?.uid) return;

    const userRef = doc(db, 'users', pendingUser.uid);

    try {
      await updateDoc(userRef, {
        isNewUser: false,
        profileIncomplete: false,
      });

      const snap = await getDoc(userRef);
      const data = snap.data();
      const role = data?.role as UserRole;

      if (!role && !data?.isExecutive) {
        throw new Error('No role found on user document after setup.');
      }

      goToDashboard(role, data?.isExecutive === true);
    } catch (error: any) {
      console.error('handleSetupComplete failed:', error);
      toast({ title: 'Could not finish setup', description: error.message, variant: 'destructive' });
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setStatusMessage(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const isSignup = tab === 'signup';
      await handleUserRouting(result.user, isSignup, isSignup ? selectedRole : null);
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
      const result = await signUp(email, password, fullName, selectedRole);
      await handleUserRouting(result.user, true, selectedRole);
    } catch (err: any) {
      toast({ title: 'Signup failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open && stage === 'auth'} onOpenChange={onOpenChange}>
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

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4 mt-4">
                <div>
                  <Label className="mb-1.5 block">Register As</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedRole('referee')}
                      className={`py-2 px-3 rounded-md border text-sm font-medium transition-colors ${selectedRole === 'referee'
                        ? 'bg-[#006747] text-white border-[#006747]'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                    >
                      Referee
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedRole('coach')}
                      className={`py-2 px-3 rounded-md border text-sm font-medium transition-colors ${selectedRole === 'coach'
                        ? 'bg-[#006747] text-white border-[#006747]'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                    >
                      Coach
                    </button>
                  </div>
                </div>
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
                  {loading && <Loader2 className="mr-2 animate-spin text-white" size={16} />}
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

      <RoleSelectionModal
        open={stage === 'role-select'}
        onSelect={(role) => handleRoleChosen(role, false)}
        onDismiss={() => handleRoleChosen('referee', true)}
      />

      {stage === 'setup' && pendingUser && (
        <SetupProfileModal
          open={stage === 'setup'}
          uid={pendingUser.uid}
          onComplete={handleSetupComplete}
        />
      )}
    </>
  );
};

export default LoginModal;
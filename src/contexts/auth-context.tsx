
// src/contexts/auth-context.tsx
'use client';

import type { ReactNode, Dispatch, SetStateAction } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User as FirebaseUser, AuthError, Auth } from 'firebase/auth';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
  updateProfile,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword
} from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { useToast } from '@/hooks/use-toast';

interface AuthContextType {
  user: FirebaseUser | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUserProfile: (profileData: { displayName?: string | null; photoURL?: string | null; }) => Promise<void>;
  reauthenticateAndChangePassword: (currentPass: string, newPass: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const login = async (email: string, pass: string) => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      toast({ title: 'Login Successful', description: `Welcome back!` });
      router.push('/dashboard');
    } catch (error) {
      const authError = error as AuthError;
      console.error('Login error:', authError);
      let errorMessage = authError.message || 'An unexpected error occurred.';
      if (authError.code === 'auth/invalid-credential' || authError.code === 'auth/wrong-password' || authError.code === 'auth/user-not-found') {
        errorMessage = 'Invalid email or password. Please try again.';
      }
      toast({ variant: 'destructive', title: 'Login Failed', description: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await firebaseSignOut(auth);
      toast({ title: 'Logged Out', description: 'You have been successfully logged out.' });
      router.push('/login');
    } catch (error) {
      const authError = error as AuthError;
      console.error('Logout error:', authError);
      toast({ variant: 'destructive', title: 'Logout Failed', description: authError.message || 'Could not log out.' });
    } finally {
      setUser(null); 
      setLoading(false);
    }
  };

  const updateUserProfile = async (profileData: { displayName?: string | null; photoURL?: string | null; }) => {
    if (!auth.currentUser) {
      toast({ variant: "destructive", title: "Not Authenticated", description: "No user is currently signed in." });
      throw new Error("User not authenticated");
    }
    try {
      await updateProfile(auth.currentUser, profileData);
      setUser(prevUser => {
        if (!prevUser) return null;
        const updatedUser = { ...prevUser };
        if (profileData.displayName !== undefined) { 
          updatedUser.displayName = profileData.displayName;
        }
        if (profileData.photoURL !== undefined) {
          updatedUser.photoURL = profileData.photoURL;
        }
        return { ...updatedUser } as FirebaseUser; 
      });
      toast({ title: "Profile Updated", description: "Your profile has been successfully updated." });
    } catch (error) {
      const authError = error as AuthError;
      console.error("Error updating profile:", authError);
      toast({ variant: "destructive", title: "Profile Update Failed", description: authError.message || "Could not update your profile." });
      throw authError;
    }
  };

  const reauthenticateAndChangePassword = async (currentPass: string, newPass: string) => {
    if (!auth.currentUser || !auth.currentUser.email) {
        toast({ variant: "destructive", title: "Error", description: "User not found or email missing."});
        throw new Error("User not found or email missing for reauthentication.");
    }
    const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPass);
    try {
        await reauthenticateWithCredential(auth.currentUser, credential);
        await updatePassword(auth.currentUser, newPass);
        toast({ title: "Password Updated", description: "Your password has been successfully changed." });
    } catch (error) {
        const authError = error as AuthError;
        let errorMessage = "Could not update password.";
        if (authError.code === 'auth/wrong-password') {
          errorMessage = "The current password you entered is incorrect.";
        } else if (authError.code === 'auth/weak-password') {
          errorMessage = "The new password is too weak. It must be at least 6 characters long.";
        }
        console.error("Re-authentication or password change error:", authError);
        toast({ variant: "destructive", title: "Operation Failed", description: errorMessage });
        throw authError;
    }
  };


  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUserProfile, reauthenticateAndChangePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

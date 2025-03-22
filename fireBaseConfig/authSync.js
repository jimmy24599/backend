import { auth, db } from './firebaseConfig';
import { useAuth } from '@clerk/clerk-expo';
import { signInWithCustomToken } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

export const useAuthSync = () => {
  const { getToken, userId: clerkUserId, isSignedIn } = useAuth();
  const syncUser = async () => {
    try {
      // Get Clerk token
      const token = await getToken({ template: 'firebase' });
      
      // Sign in to Firebase
      const userCredential = await signInWithCustomToken(auth, token);
      const firebaseUser = userCredential.user;

      // Update Firestore
      await setDoc(doc(db, 'users', firebaseUser.uid), {
        clerkUserId: clerkUserId,
        lastLogin: new Date().toISOString()
      }, { merge: true });

    } catch (error) {
      console.error('Auth sync error:', error);
    }
  };

  return { syncUser };
};

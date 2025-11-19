'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

// Convert WebAuthn errors to user-friendly messages
function getUserFriendlyError(error: any): string {
  const errorMessage = error?.message || error?.toString() || '';

  // User cancelled the operation
  if (errorMessage.includes('abort') || errorMessage.includes('cancel')) {
    return 'Passkey authentication was cancelled. Please try again.';
  }

  // Timeout
  if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
    return 'The passkey request timed out. Please try again.';
  }

  // Not allowed / privacy error
  if (errorMessage.includes('not allowed') || errorMessage.includes('NotAllowedError')) {
    return 'Passkey authentication was not allowed. Please make sure you have a passkey set up for this device.';
  }

  // Invalid state (passkey doesn't exist)
  if (errorMessage.includes('InvalidStateError')) {
    return 'A passkey is already registered for this account on this device. Try logging in instead.';
  }

  // Credential not found
  if (errorMessage.includes('NotFoundError') || errorMessage.includes('not found')) {
    return 'No passkey found for this account on this device. Please register first.';
  }

  // Network/server errors
  if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
    return 'Network error. Please check your connection and try again.';
  }

  // Session expired
  if (errorMessage.includes('session expired') || errorMessage.includes('Authentication session expired')) {
    return 'Your session expired. Please try again.';
  }

  // User not found
  if (errorMessage.includes('User not found')) {
    return 'No account found with this username. Please register first.';
  }

  // Verification failed
  if (errorMessage.includes('Verification failed')) {
    return 'Authentication failed. Please try again or re-register your passkey.';
  }

  // Default to original error if we don't recognize it
  return errorMessage || 'An error occurred. Please try again.';
}

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    setLoading(true);
    setError('');

    try {
      // Get registration options
      const optionsRes = await fetch('/api/auth/register-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });

      if (!optionsRes.ok) {
        const data = await optionsRes.json();
        throw new Error(data.error || 'Failed to get registration options');
      }

      const options = await optionsRes.json();

      // Start passkey registration
      const registrationResponse = await startRegistration({ optionsJSON: options });

      // Verify registration
      const verifyRes = await fetch('/api/auth/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationResponse),
      });

      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        throw new Error(data.error || 'Registration failed');
      }

      // Success - redirect to app
      router.push('/');
    } catch (err: any) {
      console.error('Registration error:', err);
      setError(getUserFriendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    setLoading(true);
    setError('');

    try {
      // Get authentication options
      const optionsRes = await fetch('/api/auth/login-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });

      if (!optionsRes.ok) {
        const data = await optionsRes.json();
        throw new Error(data.error || 'Failed to get authentication options');
      }

      const options = await optionsRes.json();

      // Start passkey authentication
      const authResponse = await startAuthentication({ optionsJSON: options });

      // Verify authentication
      const verifyRes = await fetch('/api/auth/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authResponse),
      });

      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        throw new Error(data.error || 'Authentication failed');
      }

      // Success - redirect to app
      router.push('/');
    } catch (err: any) {
      console.error('Login error:', err);
      setError(getUserFriendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-2 text-center">
          Todo App
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6 text-center">
          Sign in with your passkey
        </p>

        <form onSubmit={isRegistering ? handleRegister : handleLogin}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              required
              disabled={loading}
              autoComplete="username webauthn"
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mb-3"
          >
            {loading ? 'Processing...' : isRegistering ? 'Register with Passkey' : 'Sign in with Passkey'}
          </button>

          <button
            type="button"
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError('');
            }}
            disabled={loading}
            className="w-full px-4 py-2 text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
          >
            {isRegistering ? 'Already have an account? Sign in' : "Don't have an account? Register"}
          </button>
        </form>

        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            <strong>Passkeys</strong> use your device's biometrics (fingerprint, face recognition) or PIN for secure authentication.
            No passwords needed!
          </p>
        </div>
      </div>
    </div>
  );
}

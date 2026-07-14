'use client';

import { useState, useEffect } from 'react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const router = useRouter();

  // Redirect immediately if already authenticated.
  useEffect(() => {
    fetch('/api/auth/me').then(res => {
      if (res.ok) router.replace('/');
    });
  }, [router]);

  async function handleRegister() {
    if (!username.trim()) { setError('Username is required'); return; }
    setError(null);
    setLoading(true);
    try {
      const optRes = await fetch('/api/auth/register-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });
      if (!optRes.ok) { setError((await optRes.json()).error ?? 'Failed to get options'); return; }

      const attestation = await startRegistration({ optionsJSON: await optRes.json() });

      const verRes = await fetch('/api/auth/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), response: attestation }),
      });
      if (!verRes.ok) { setError((await verRes.json()).error ?? 'Registration failed'); return; }

      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    if (!username.trim()) { setError('Username is required'); return; }
    setError(null);
    setLoading(true);
    try {
      const optRes = await fetch('/api/auth/login-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });
      if (!optRes.ok) { setError((await optRes.json()).error ?? 'Failed to get options'); return; }

      const assertion = await startAuthentication({ optionsJSON: await optRes.json() });

      const verRes = await fetch('/api/auth/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), response: assertion }),
      });
      if (!verRes.ok) { setError((await verRes.json()).error ?? 'Login failed'); return; }

      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Todo App</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Sign in or register with your passkey — no password needed.
          </p>
        </div>

        {/* Username field */}
        <div className="space-y-1">
          <label
            htmlFor="username"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Username
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }}
            placeholder="e.g. alice"
            autoComplete="username"
            disabled={loading}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                       placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500
                       disabled:opacity-50"
          />
        </div>

        {/* Error message */}
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {/* Action buttons */}
        <div className="space-y-2">
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full py-2 px-4 rounded-lg font-medium text-white
                       bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Working…' : 'Sign in with Passkey'}
          </button>
          <button
            onClick={handleRegister}
            disabled={loading}
            className="w-full py-2 px-4 rounded-lg font-medium
                       text-gray-700 dark:text-gray-300
                       bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700
                       disabled:opacity-50 transition-colors"
          >
            {loading ? 'Working…' : 'Register New Account'}
          </button>
        </div>

        <p className="text-xs text-center text-gray-400 dark:text-gray-500">
          Uses your device biometrics, PIN, or security key.
        </p>
      </div>
    </main>
  );
}

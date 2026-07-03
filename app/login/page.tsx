'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState<'register' | 'login' | null>(null);

  async function handleRegister() {
    if (!username.trim()) { setError('Username is required'); return; }
    setError(''); setLoading('register');
    try {
      const optRes = await fetch('/api/auth/register-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });
      const options = await optRes.json();
      if (!optRes.ok) { setError(options.error ?? 'Failed to start registration'); return; }

      const registrationResponse = await startRegistration({ optionsJSON: options });

      const verRes = await fetch('/api/auth/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), response: registrationResponse }),
      });
      const result = await verRes.json();
      if (!verRes.ok) { setError(result.error ?? 'Registration failed'); return; }

      router.push('/');
      router.refresh();
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Registration cancelled');
      } else {
        setError(err instanceof Error ? err.message : 'Registration failed');
      }
    } finally {
      setLoading(null);
    }
  }

  async function handleLogin() {
    if (!username.trim()) { setError('Username is required'); return; }
    setError(''); setLoading('login');
    try {
      const optRes = await fetch('/api/auth/login-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });
      const options = await optRes.json();
      if (!optRes.ok) { setError(options.error ?? 'User not found'); return; }

      const authResponse = await startAuthentication({ optionsJSON: options });

      const verRes = await fetch('/api/auth/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), response: authResponse }),
      });
      const result = await verRes.json();
      if (!verRes.ok) { setError(result.error ?? 'Login failed'); return; }

      router.push('/');
      router.refresh();
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Login cancelled');
      } else {
        setError(err instanceof Error ? err.message : 'Login failed');
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">📝 Todo App</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Sign in or create an account</p>
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Username
          </label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="Enter your username"
            autoComplete="username"
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleLogin}
            disabled={!!loading}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
          >
            {loading === 'login' ? 'Signing in…' : '🔑 Login'}
          </button>
          <button
            onClick={handleRegister}
            disabled={!!loading}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
          >
            {loading === 'register' ? 'Registering…' : '✨ Register'}
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 dark:text-gray-500">
          Uses WebAuthn/Passkeys — no passwords required
        </p>
      </div>
    </div>
  );
}

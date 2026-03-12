"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  // Redirect if already logged in
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (res.ok) {
          router.replace("/");
        } else {
          setIsCheckingSession(false);
        }
      })
      .catch(() => setIsCheckingSession(false));
  }, [router]);

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    if (!username.trim()) {
      setError("Please enter a username.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setMessage(null);

    try {
      // 1. Get registration options
      const optionsRes = await fetch("/api/auth/register-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });

      if (!optionsRes.ok) {
        const data = await optionsRes.json();
        setError(data.error || "Failed to start registration.");
        setIsLoading(false);
        return;
      }

      const options = await optionsRes.json();

      // 2. Start WebAuthn registration ceremony
      const regResponse = await startRegistration({ optionsJSON: options });

      // 3. Verify with server
      const verifyRes = await fetch("/api/auth/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          response: regResponse,
        }),
      });

      const verifyData = await verifyRes.json();

      if (!verifyRes.ok || !verifyData.verified) {
        setError(verifyData.error || "Registration failed.");
        setIsLoading(false);
        return;
      }

      setMessage("Registration successful! Redirecting...");
      router.push("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Registration cancelled or failed.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    if (!username.trim()) {
      setError("Please enter a username.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setMessage(null);

    try {
      // 1. Get login options
      const optionsRes = await fetch("/api/auth/login-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });

      if (!optionsRes.ok) {
        const data = await optionsRes.json();
        setError(data.error || "Failed to start login.");
        setIsLoading(false);
        return;
      }

      const options = await optionsRes.json();

      // 2. Start WebAuthn authentication ceremony
      const authResponse = await startAuthentication({ optionsJSON: options });

      // 3. Verify with server
      const verifyRes = await fetch("/api/auth/login-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          response: authResponse,
        }),
      });

      const verifyData = await verifyRes.json();

      if (!verifyRes.ok || !verifyData.verified) {
        setError(verifyData.error || "Login failed.");
        setIsLoading(false);
        return;
      }

      setMessage("Login successful! Redirecting...");
      router.push("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login cancelled or failed.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  if (isCheckingSession) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <p style={{ color: "#6b7280" }}>Checking session...</p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        padding: "1rem",
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: "12px",
          padding: "2rem",
          boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
          width: "100%",
          maxWidth: "400px",
        }}
      >
        <h1
          style={{
            textAlign: "center",
            marginBottom: "0.25rem",
            fontSize: "1.5rem",
            fontWeight: 700,
          }}
        >
          Todo App
        </h1>
        <p
          style={{
            textAlign: "center",
            color: "#6b7280",
            marginBottom: "1.5rem",
            fontSize: "0.875rem",
          }}
        >
          Sign in with your passkey
        </p>

        <form onSubmit={(e) => e.preventDefault()}>
          <label
            htmlFor="username"
            style={{
              display: "block",
              marginBottom: "0.5rem",
              fontWeight: 600,
              fontSize: "0.875rem",
            }}
          >
            Username
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            disabled={isLoading}
            autoComplete="username webauthn"
            style={{
              width: "100%",
              padding: "0.625rem 0.75rem",
              border: "1px solid #d1d5db",
              borderRadius: "8px",
              fontSize: "0.875rem",
              marginBottom: "1rem",
              boxSizing: "border-box",
            }}
          />

          {error && (
            <div
              style={{
                background: "#fef2f2",
                color: "#b91c1c",
                padding: "0.5rem 0.75rem",
                borderRadius: "6px",
                marginBottom: "1rem",
                fontSize: "0.8125rem",
              }}
            >
              {error}
            </div>
          )}

          {message && (
            <div
              style={{
                background: "#f0fdf4",
                color: "#15803d",
                padding: "0.5rem 0.75rem",
                borderRadius: "6px",
                marginBottom: "1rem",
                fontSize: "0.8125rem",
              }}
            >
              {message}
            </div>
          )}

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              type="button"
              onClick={handleRegister}
              disabled={isLoading}
              style={{
                flex: 1,
                padding: "0.625rem",
                background: "#2563eb",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontWeight: 600,
                fontSize: "0.875rem",
                cursor: isLoading ? "not-allowed" : "pointer",
                opacity: isLoading ? 0.6 : 1,
              }}
            >
              {isLoading ? "..." : "Register"}
            </button>
            <button
              type="button"
              onClick={handleLogin}
              disabled={isLoading}
              style={{
                flex: 1,
                padding: "0.625rem",
                background: "#16a34a",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontWeight: 600,
                fontSize: "0.875rem",
                cursor: isLoading ? "not-allowed" : "pointer",
                opacity: isLoading ? 0.6 : 1,
              }}
            >
              {isLoading ? "..." : "Login"}
            </button>
          </div>
        </form>

        <p
          style={{
            textAlign: "center",
            color: "#9ca3af",
            marginTop: "1.5rem",
            fontSize: "0.75rem",
          }}
        >
          Secured with WebAuthn/Passkeys — no passwords needed
        </p>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const runRegister = async () => {
    const value = username.trim();
    if (!value) {
      setMessage("Username is required");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const optionsResponse = await fetch("/api/auth/register-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: value }),
      });

      const optionsJson = (await optionsResponse.json()) as { success: boolean; options?: unknown; error?: string };
      if (!optionsResponse.ok || !optionsJson.success || !optionsJson.options) {
        setMessage(optionsJson.error || "Failed to start registration");
        setLoading(false);
        return;
      }

      const attestation = await startRegistration({ optionsJSON: optionsJson.options as Parameters<typeof startRegistration>[0]["optionsJSON"] });

      const verifyResponse = await fetch("/api/auth/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: value, response: attestation }),
      });

      const verifyJson = (await verifyResponse.json()) as { success: boolean; error?: string };
      if (!verifyResponse.ok || !verifyJson.success) {
        setMessage(verifyJson.error || "Registration failed");
        setLoading(false);
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setMessage("Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const runLogin = async () => {
    const value = username.trim();
    if (!value) {
      setMessage("Username is required");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const optionsResponse = await fetch("/api/auth/login-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: value }),
      });

      const optionsJson = (await optionsResponse.json()) as { success: boolean; options?: unknown; error?: string };
      if (!optionsResponse.ok || !optionsJson.success || !optionsJson.options) {
        setMessage(optionsJson.error || "Failed to start login");
        setLoading(false);
        return;
      }

      const assertion = await startAuthentication({ optionsJSON: optionsJson.options as Parameters<typeof startAuthentication>[0]["optionsJSON"] });

      const verifyResponse = await fetch("/api/auth/login-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: value, response: assertion }),
      });

      const verifyJson = (await verifyResponse.json()) as { success: boolean; error?: string };
      if (!verifyResponse.ok || !verifyJson.success) {
        setMessage(verifyJson.error || "Login failed");
        setLoading(false);
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setMessage("Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="container">
      <section className="card auth-card">
        <h1>Todo App Login</h1>
        <p className="muted">Use passkeys (WebAuthn) to register or sign in.</p>
        <div className="field" style={{ marginBottom: "0.75rem" }}>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="your-name"
            autoComplete="username"
          />
        </div>
        <div className="row">
          <button className="btn primary" disabled={loading} onClick={runRegister}>
            {loading ? "Working..." : "Register"}
          </button>
          <button className="btn success" disabled={loading} onClick={runLogin}>
            {loading ? "Working..." : "Login"}
          </button>
        </div>
        {message ? <p style={{ color: "#a83322" }}>{message}</p> : null}
      </section>
    </main>
  );
}

import { useState, useEffect, useRef } from "react";
import { CodeIcon, MailIcon } from "./icons";
import { API } from "../constants";

/* ── Verify Screen ── */
export function VerifyScreen({ token, onLogin }) {
  const [status,  setStatus]  = useState("verifying");
  const [message, setMessage] = useState("");
  const calledRef = useRef(false); // prevent double call in React dev mode

  useEffect(() => {
    if (calledRef.current) return; // already called, skip
    calledRef.current = true;

    (async () => {
      try {
        const res  = await fetch(`${API}/auth/verify?token=${token}`);
        const data = await res.json();

        // 200 OK = success, even if called twice the first call worked
        if (res.ok) {
          localStorage.setItem("token", data.access_token);
          localStorage.setItem("email", data.email);
          setStatus("success");
          setTimeout(() => onLogin(data.email), 1500);
        } else {
          // If token already used (400) but we have a token in localStorage
          // it means verification already succeeded — just redirect
          const existingToken = localStorage.getItem("token");
          if (existingToken) {
            setStatus("success");
            setTimeout(() => onLogin(localStorage.getItem("email")), 1500);
          } else {
            throw new Error(data.detail);
          }
        }
      } catch (e) {
        setStatus("error");
        setMessage(e.message);
      }
    })();
  }, [token]);

  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ animation: "scaleIn 0.2s ease" }}>
        <div className="auth-icon-wrap" style={{ color: status === "error" ? "#ef4444" : "var(--accent)" }}>
          {status === "verifying" && <div className="upload-spinner" style={{ width: 28, height: 28 }} />}
          {status === "success"   && <span style={{ fontSize: 28 }}>✓</span>}
          {status === "error"     && <span style={{ fontSize: 28 }}>✗</span>}
        </div>
        <h1 className="auth-title">
          {status === "verifying" ? "Verifying…"
           : status === "success" ? "Email verified!"
           : "Verification failed"}
        </h1>
        <p className="auth-sub">
          {status === "verifying" ? "Please wait a moment…"
           : status === "success" ? "Redirecting you to the app…"
           : message}
        </p>
        {status === "error" && (
          <p className="auth-hint">
            Already verified?{" "}
            <button className="auth-link" onClick={() => window.location.href = "/"}>
              Go to login
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Auth Screen (login / signup) ── */
export function AuthScreen({ onLogin }) {
  const [mode,      setMode]     = useState("login");
  const [name,      setName]     = useState("");
  const [email,     setEmail]    = useState("");
  const [password,  setPassword] = useState("");
  const [error,     setError]    = useState("");
  const [loading,   setLoading]  = useState(false);
  const [animating, setAnimating]= useState(false);

  const switchMode = (newMode) => {
    setAnimating(true);
    setError("");
    setTimeout(() => { setMode(newMode); setAnimating(false); }, 200);
  };

  const submit = async () => {
    setError("");
    if (mode === "signup" && !name.trim()) return setError("Please enter your name.");
    if (!email || !password)              return setError("Please fill in all fields.");
    if (mode === "signup" && password.length < 8) return setError("Password must be at least 8 characters.");

    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const body     = mode === "login" ? { email, password } : { name, email, password };
      const res  = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Something went wrong");

      if (mode === "signup") {
        setMode("sent");
      } else {
        localStorage.setItem("token", data.access_token);
        localStorage.setItem("email", data.email);
        localStorage.setItem("name",  data.name || email.split("@")[0]);
        onLogin(data.email);
      }
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  if (mode === "sent") {
    return (
      <div className="auth-screen">
        <div className="auth-card" style={{ animation: "scaleIn 0.25s ease" }}>
          <div className="auth-icon-wrap"><MailIcon /></div>
          <h1 className="auth-title">Check your email</h1>
          <p className="auth-sub">
            We sent a verification link to{" "}
            <strong style={{ color: "var(--text)" }}>{email}</strong>.
            Click it to activate your account.
          </p>
          <p className="auth-hint">
            Didn't get it?{" "}
            <button className="auth-link" onClick={() => switchMode("signup")}>Try again</button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div
        className="auth-card"
        style={{
          opacity:    animating ? 0 : 1,
          transform:  animating ? "translateY(8px)" : "translateY(0)",
          transition: "opacity 0.2s ease, transform 0.2s ease",
        }}
      >
        <div className="auth-logo">
          <div className="logo-icon"><CodeIcon /></div>
          <span className="logo-text">CodeBase AI</span>
        </div>

        <h1 className="auth-title">{mode === "login" ? "Welcome back" : "Create account"}</h1>
        <p className="auth-sub">
          {mode === "login" ? "Sign in to continue" : "Start exploring your codebase with AI"}
        </p>

        {error && <div className="auth-error">{error}</div>}

        <div className="auth-fields">
          <div
            className="auth-field-slide"
            style={{
              maxHeight: mode === "signup" ? "70px" : "0px",
              opacity: mode === "signup" ? 1 : 0,
              overflow: "hidden",
              transition: "max-height 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.25s ease",
              marginBottom: mode === "signup" ? "0" : "0",
            }}
          >
            <input className="auth-input" type="text" placeholder="Full name"
              value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()} />
          </div>
          <input className="auth-input" type="email" placeholder="Email address"
            value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submit()}
            autoFocus={mode === "login"} />
          <input className="auth-input" type="password" placeholder="Password (min. 8 characters)"
            value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submit()} />
        </div>

        <button className="auth-btn" onClick={submit} disabled={loading}>
          {loading
            ? <span className="auth-spinner" />
            : mode === "login" ? "Sign in" : "Create account"}
        </button>

        <p className="auth-hint">
          {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
          <button className="auth-link" onClick={() => switchMode(mode === "login" ? "signup" : "login")}>
            {mode === "login" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
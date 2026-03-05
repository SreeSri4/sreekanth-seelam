import { useEffect, useRef, useState } from "react";

// ─── CHANGE THIS TO YOUR PASSCODE ─────────────────────────────────────────
const PASSCODE = "9338";
// ──────────────────────────────────────────────────────────────────────────

const SESSION_KEY = "portfolio_auth";

function isAuthenticated(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "true";
  } catch {
    return false;
  }
}

export default function PasscodeGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(isAuthenticated);
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authed) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [authed]);

  function handleSubmit() {
    if (input === PASSCODE) {
      sessionStorage.setItem(SESSION_KEY, "true");
      setAuthed(true);
      setError(false);
    } else {
      setError(true);
      setShake(true);
      setInput("");
      setTimeout(() => setShake(false), 500);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSubmit();
  }

  if (authed) return <>{children}</>;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div
        className={`w-full max-w-sm mx-4 p-8 rounded-2xl border border-sidebar-border bg-sidebar shadow-xl flex flex-col items-center gap-6 ${
          shake ? "animate-shake" : ""
        }`}
      >
        {/* Icon */}
        <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center">
          <svg
            className="w-7 h-7 text-primary"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
        </div>

        {/* Title */}
        <div className="text-center">
          <h1 className="font-bold text-lg text-foreground">Sreekanth Seelam</h1>
          <p className="text-sm text-muted-foreground mt-1">Enter passcode to continue</p>
        </div>

        {/* Input */}
        <div className="w-full flex flex-col gap-2">
          <input
            ref={inputRef}
            type="password"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError(false);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Passcode"
            className={`w-full px-4 py-3 rounded-xl bg-background border text-foreground text-center text-lg tracking-widest outline-none transition-colors
              focus:ring-2 focus:ring-primary/50
              ${error
                ? "border-destructive focus:ring-destructive/50"
                : "border-sidebar-border focus:border-primary"
              }`}
            maxLength={20}
            autoComplete="current-password"
          />
          {error && (
            <p className="text-destructive text-xs text-center">
              Incorrect passcode. Try again.
            </p>
          )}
        </div>

        {/* Button */}
        <button
          type="button"
          onClick={handleSubmit}
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Unlock
        </button>
      </div>

      {/* Shake animation */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
      `}</style>
    </div>
  );
}

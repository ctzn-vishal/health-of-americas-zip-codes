"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// ZIP search. On the landing it routes into the atlas; inside the atlas an onSubmit
// callback updates state directly. It never loads the geo catalog — it validates a
// 5-digit ZIP and hands it off.
export default function ZipSearch({
  autoFocus = false,
  compact = false,
  placeholder = "Enter a ZIP code — e.g. 10001",
  onSubmit,
}: {
  autoFocus?: boolean;
  compact?: boolean;
  placeholder?: string;
  onSubmit?: (zip: string) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const zip = value.trim();
    if (!/^\d{5}$/.test(zip)) {
      setMsg("Enter a 5-digit ZIP code.");
      return;
    }
    setMsg(null);
    if (onSubmit) onSubmit(zip);
    else router.push(`/atlas?selected=${zip}&view=snapshot`);
  }

  const input = (
    <form className="zip-search" onSubmit={submit} role="search" aria-label="Find a ZIP code">
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={5}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => {
          setValue(e.target.value.replace(/[^\d]/g, "").slice(0, 5));
          if (msg) setMsg(null);
        }}
        placeholder={placeholder}
        aria-label="ZIP code"
        aria-describedby={compact ? undefined : "zip-search-msg"}
      />
      <button type="submit">Find</button>
    </form>
  );

  if (compact) {
    return (
      <div className="zip-search-compact">
        {input}
        {msg && <span className="err" role="alert">{msg}</span>}
      </div>
    );
  }

  return (
    <div className="zip-search-wrap">
      {input}
      <p id="zip-search-msg" className="zip-search-msg" role={msg ? "alert" : undefined}>
        {msg ? (
          <span className="err">{msg}</span>
        ) : (
          <span className="muted">Opens the ZIP&apos;s profile on the interactive map.</span>
        )}
      </p>
    </div>
  );
}

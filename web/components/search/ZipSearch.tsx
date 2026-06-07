"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Hero / landing search. Stays intentionally light: it does NOT load the geo catalog —
// it validates a 5-digit ZIP and routes into the atlas, which resolves and pins it.
export default function ZipSearch({
  autoFocus = false,
  placeholder = "Enter a ZIP code — e.g. 10001",
}: {
  autoFocus?: boolean;
  placeholder?: string;
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
    router.push(`/atlas?selected=${zip}`);
  }

  return (
    <div className="zip-search-wrap">
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
          aria-describedby="zip-search-msg"
        />
        <button type="submit">Find</button>
      </form>
      <p
        id="zip-search-msg"
        className="zip-search-msg"
        role={msg ? "alert" : undefined}
      >
        {msg ? <span className="err">{msg}</span> : <span className="muted">Opens the ZIP&apos;s profile on the interactive map.</span>}
      </p>
    </div>
  );
}

import { ImageResponse } from "next/og";

// Required for a metadata image route under `output: export` — bake the PNG at build time.
export const dynamic = "force-static";

export const alt = "Health of America's ZIP Codes — a map-first atlas of U.S. health outcomes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Generated at build time for the static export — a branded dark social card.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          backgroundColor: "#080b12",
          backgroundImage:
            "radial-gradient(900px 520px at 78% -8%, rgba(108,182,255,0.22), transparent 60%), radial-gradient(760px 440px at 0% 0%, rgba(244,103,93,0.16), transparent 55%)",
          color: "#e9eef6",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "11px",
              backgroundImage: "linear-gradient(135deg, #ffe08a, #f4675d 48%, #6cb6ff)",
            }}
          />
          <div
            style={{
              fontFamily: "system-ui, sans-serif",
              fontSize: "24px",
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#6cb6ff",
            }}
          >
            U.S. Public-Health Observatory
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: "78px", lineHeight: 1.04, fontWeight: 600, letterSpacing: "-0.02em" }}>
            The health of America&apos;s
          </div>
          <div
            style={{
              fontSize: "78px",
              lineHeight: 1.04,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "#f4675d",
            }}
          >
            ZIP codes
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontFamily: "system-ui, sans-serif",
            fontSize: "26px",
            color: "#aeb9c9",
            maxWidth: "880px",
            lineHeight: 1.4,
          }}
        >
          31,491 ZIP/ZCTA areas · 10 health measures · mapped against the national average and
          neighborhood deprivation.
        </div>
      </div>
    ),
    { ...size },
  );
}

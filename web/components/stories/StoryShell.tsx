// Server-safe layout primitives for story pages (no hooks, no browser APIs) — these
// render real prose + figure chrome into the static HTML around the client D3 islands.
import Link from "next/link";
import { STORIES, storyPath, type StoryDef } from "@/lib/stories";

export function StoryHead({ story, meta }: { story: StoryDef; meta: string }) {
  return (
    <header className="story-head">
      <p className="eyebrow">{story.kicker}</p>
      <h1>{story.title}</h1>
      <p className="story-dek">{story.dek}</p>
      <p className="story-meta">{meta}</p>
    </header>
  );
}

export function StoryFig({
  title,
  sub,
  caption,
  children,
}: {
  title: string;
  sub?: string;
  caption: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <figure className="story-fig">
      <p className="fig-title">{title}</p>
      {sub && <p className="fig-sub">{sub}</p>}
      {children}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

export function StoryNext({ current }: { current: string }) {
  const others = STORIES.filter((s) => s.slug !== current);
  return (
    <nav className="story-next" aria-label="More stories">
      <h2>Keep reading</h2>
      <div className="story-next-grid">
        {others.map((s) => (
          <Link key={s.slug} className="story-card" href={storyPath(s.slug)}>
            <span className="sc-kicker">{s.kicker}</span>
            <h3>{s.title}</h3>
            <span className="sc-go">Read the story →</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function StoryCaveat() {
  return (
    <div className="story-callout">
      <strong>Read this carefully.</strong> Estimates are CDC PLACES-style model-based small-area
      estimates, not direct measurements. Every association here is <strong>ecological</strong> — it
      describes places, not people, and implies nothing about causation. Analyses use the ~23,800
      ZIP/ZCTA areas with complete data on all 26 measures; coverage is limited mainly by the newer
      social-needs measures, so the smallest rural areas are under-represented. Full details on the{" "}
      <Link href="/methods/">methods page</Link>.
    </div>
  );
}

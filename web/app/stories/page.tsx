import type { Metadata } from "next";
import Link from "next/link";
import StorySig from "@/components/stories/StorySig";
import { getArchetypes, getCorrelations, getGradients, getMentalHealth, getPca, getSmoking, getWealthGap } from "@/lib/serverData";
import { STORIES, storyPath } from "@/lib/stories";

export const metadata: Metadata = {
  title: "Stories — what 26 measures across 32,409 ZIP codes can teach",
  description:
    "Precomputed analyses of the ZIP Health Atlas: the single axis behind most place-based health differences, the correlation structure of 26 measures, four community archetypes, wealth gaps, and the deprivation gradient.",
};

export default async function StoriesIndex() {
  const [pca, corr, arch, grad, wealth, mh, smoke] = await Promise.all([
    getPca(),
    getCorrelations(),
    getArchetypes(),
    getGradients(),
    getWealthGap(),
    getMentalHealth(),
    getSmoking(),
  ]);
  const pc1 = Math.round(pca.explained[0] * 100);
  const topPair = corr.top_pairs[0];
  const steepest = grad.metrics[0];
  const stats: Record<string, React.ReactNode> = {
    "one-axis": (
      <span className="sc-stat">
        {pc1}
        <span className="unit">% of variance, one axis</span>
      </span>
    ),
    connected: (
      <span className="sc-stat">
        ρ {topPair.rho.toFixed(2)}
        <span className="unit"> {topPair.a_label.toLowerCase()} × {topPair.b_label.toLowerCase()}</span>
      </span>
    ),
    "four-americas": (
      <span className="sc-stat">
        {arch.k}
        <span className="unit"> archetypes, {Math.round(arch.n_assigned / 1000)}k ZIP areas</span>
      </span>
    ),
    gradient: (
      <span className="sc-stat">
        {steepest.rel?.toFixed(1)}×
        <span className="unit"> {steepest.short.toLowerCase()}, most- vs least-deprived</span>
      </span>
    ),
    "wealth-gap": (
      <span className="sc-stat">
        {wealth.score.worse_count}/26
        <span className="unit"> measures worse in bottom wealth decile</span>
      </span>
    ),
    "diagnosis-gap": (
      <span className="sc-stat">
        ρ {mh.corr.ratio.black}
        <span className="unit"> diagnosis ratio × Black population share</span>
      </span>
    ),
    "tobacco-belt": (
      <span className="sc-stat">
        ρ {smoke.rho_adi}
        <span className="unit"> smoking × neighborhood deprivation</span>
      </span>
    ),
  };

  return (
    <main id="main" className="prose-wrap">
      <header className="page-head">
        <p className="eyebrow">Stories</p>
        <h1>What the data teaches</h1>
        <p className="page-lede">
          The atlas lets you look anything up. These pieces do the opposite: they start from the full
          matrix — 26 measures × {corr.n.toLocaleString()} ZIP/ZCTA areas — and show the structure
          that emerges. Everything is precomputed from the same public payloads the atlas serves; every
          figure is interactive.
        </p>
      </header>
      <div className="story-cards">
        {STORIES.map((s) => (
          <Link key={s.slug} className="story-card" href={storyPath(s.slug)}>
            <span className="sc-kicker">{s.kicker}</span>
            <h3>{s.title}</h3>
            <StorySig slug={s.slug} />
            {stats[s.slug]}
            <p>{s.dek}</p>
            <span className="sc-go">Read the story →</span>
          </Link>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 28, fontSize: 13, maxWidth: "72ch" }}>
        All findings are ecological (about places, not people) and based on model-based small-area
        estimates. Methods, caveats, and reproduction steps are documented on the{" "}
        <Link href="/methods/">methods page</Link>.
      </p>
    </main>
  );
}

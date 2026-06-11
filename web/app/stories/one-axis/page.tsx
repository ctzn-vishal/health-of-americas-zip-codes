import type { Metadata } from "next";
import { StoryCaveat, StoryFig, StoryHead, StoryNext } from "@/components/stories/StoryShell";
import DotMap from "@/components/stories/DotMap";
import { PcaBiplot, PcaLoadings, PcaScree } from "@/components/stories/PcaPanels";
import { getPca } from "@/lib/serverData";
import { STORIES } from "@/lib/stories";

const story = STORIES.find((s) => s.slug === "one-axis")!;

export const metadata: Metadata = { title: story.title, description: story.dek };

export default async function OneAxisStory() {
  const pca = await getPca();
  const pc1 = pca.explained[0];
  const pc2 = pca.explained[1];
  const ctx1 = pca.pc_context[0];
  const ctx2 = pca.pc_context[1];
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <main id="main" className="story-wrap">
      <StoryHead
        story={story}
        meta={`Principal component analysis · ${pca.n.toLocaleString()} ZIP/ZCTA areas with complete data on all 26 measures`}
      />
      <article className="story-body">
        <p>
          Twenty-six measures sounds like twenty-six different problems: diabetes here, smoking there,
          food insecurity somewhere else. It isn&apos;t. Standardize all 26 measures and ask the data for
          its principal axes of variation, and the answer is blunt:{" "}
          <strong className="big-number">a single component explains {pct(pc1)} of the variance</strong>{" "}
          between ZIP codes. A second adds {pct(pc2)}. Together, two numbers carry{" "}
          {pct(pc1 + pc2)} of everything these 26 measures can say about how places differ.
        </p>

        <StoryFig
          title="Two components carry most of the signal"
          sub="Share of total variance explained by each principal component"
          caption={
            <>
              PCA on z-standardized measures across {pca.n.toLocaleString()} ZIP/ZCTA areas. The sharp
              elbow after PC2 means the remaining components are mostly local texture.
            </>
          }
        >
          <PcaScree explained={pca.explained} />
        </StoryFig>

        <h2>The first axis is deprivation wearing a hospital gown</h2>
        <p>
          What is this dominant axis? Look at how every measure &ldquo;loads&rdquo; onto it: nearly
          everything points the same way. ZIP codes high on PC1 have more diabetes <em>and</em> more
          smoking <em>and</em> more disability <em>and</em> more food insecurity, all at once. And the
          axis is barely about health care at all — across ZIP codes it correlates at{" "}
          <strong className="big-number">ρ = {ctx1.income}</strong> with median household income and{" "}
          <strong className="big-number">ρ = +{ctx1.adi}</strong> with the Area Deprivation Index. If
          you know how poor a neighborhood is, you already know most of what this axis knows.
        </p>
        <p>
          The exceptions are the interesting part. <strong>Binge drinking loads negative</strong> — it
          is the one behavior that rises with affluence. Cancer prevalence and skipped checkups barely
          load at all, because they answer to a different master: age.
        </p>

        <StoryFig
          title="How each measure loads on the two axes"
          sub="PC1 = overall burden · PC2 = the age-and-place axis"
          caption={
            <>
              PC2 separates <strong>older, sparser places</strong> (high cancer, heart disease, blood
              pressure — top of the list) from <strong>younger, denser ones</strong> (high loneliness,
              skipped checkups, housing insecurity). It correlates ρ = +{ctx2.age65} with the share of
              residents 65+, and ρ = {ctx2.density} with population density.
            </>
          }
        >
          <PcaLoadings ids={pca.ids} labels={pca.labels} topics={pca.topics} loadings={pca.loadings} />
        </StoryFig>

        <h2>Every ZIP code, on two axes</h2>
        <p>
          Plot every analyzed ZIP code in this two-dimensional space and color it by income, and the
          gradient is unmistakable — blue (higher-income) places pile up on the left of the burden
          axis, red (lower-income) places stretch right. The vertical spread at any income level is
          the age-and-place axis doing its separate work.
        </p>

        <StoryFig
          title="The health plane of America's ZIP codes"
          sub="Each dot is one ZIP/ZCTA area, positioned by its two principal component scores"
          caption={
            <>
              A sample of 4,500 of the {pca.n.toLocaleString()} analyzed areas. Income was not used to
              compute the axes — the color gradient emerges on its own.
            </>
          }
        >
          <PcaBiplot />
        </StoryFig>

        <StoryFig
          title="The burden axis, on the map"
          sub="ZIP centroids colored by PC1 percentile (deeper red = higher combined burden)"
          caption={
            <>
              The familiar geography appears without being asked for: the Deep South, Appalachia, the
              Rio Grande border, and pockets of every large metro at the high end; the affluent
              suburban rings at the low end.
            </>
          }
        >
          <DotMap mode="pc1" />
        </StoryFig>

        <StoryCaveat />
        <StoryNext current="one-axis" />
      </article>
    </main>
  );
}

import type { Metadata } from "next";
import CorrelationMatrix, { ContextHeatmap } from "@/components/stories/CorrelationMatrix";
import { StoryCaveat, StoryFig, StoryHead, StoryNext } from "@/components/stories/StoryShell";
import { getCorrelations } from "@/lib/serverData";
import { STORIES } from "@/lib/stories";

const story = STORIES.find((s) => s.slug === "connected")!;

export const metadata: Metadata = { title: story.title, description: story.dek };

export default async function ConnectedStory() {
  const corr = await getCorrelations();
  const social = corr.top_pairs.filter(
    (p) => p.rho >= 0.94,
  );
  const top = corr.top_pairs[0];

  return (
    <main id="main" className="story-wrap">
      <StoryHead
        story={story}
        meta={`Spearman rank correlations · ${corr.n.toLocaleString()} ZIP/ZCTA areas · hierarchically ordered`}
      />
      <article className="story-body">
        <p>
          Public-health dashboards present measures one at a time, as if a city could have a diabetes
          problem without a blood-pressure problem. The correlation matrix says otherwise. Order the 26
          measures so that correlated ones sit together, and the matrix organizes itself into
          warm blocks — clusters of conditions that travel as a package.
        </p>
        <p>
          The tightest block is the newest one: the six health-related social needs.{" "}
          <strong className="big-number">
            {top.a_label} and {top.b_label.toLowerCase()} correlate at ρ = {top.rho.toFixed(2)}
          </strong>
          {" "}across ZIP codes — about as close to lockstep as real-world data gets. All{" "}
          {social.length} of the strongest pairs in the matrix are social-needs pairs. A ZIP code
          where people struggle to afford food is, almost by definition, one where they struggle with
          housing, transportation, and utility bills. These are not six problems; they are one
          problem with six names: <strong>not enough money where people live</strong>.
        </p>

        <StoryFig
          title="All 26 measures, against each other"
          sub="Spearman ρ across ZIP/ZCTA areas, ordered by hierarchical clustering — hover any cell"
          caption={
            <>
              <strong>How to read it:</strong> warm cells move together, cool cells move in opposition.
              The large warm block is chronic disease + behavior + social needs — the burden axis. The
              cool stripes belong to binge drinking, which correlates <em>negatively</em> with most
              burdens (it rises with affluence), and cancer, which mostly tracks age rather than
              deprivation.
            </>
          }
        >
          <CorrelationMatrix data={corr} />
        </StoryFig>

        <h2>The blocks track demographics, not specialties</h2>
        <p>
          If the measures formed blocks for medical reasons, you would expect cardiology to cluster
          with cardiology and dentistry with dentistry. Instead the blocks follow social structure.
          Put the same 26 measures against neighborhood demographics, and the columns light up far
          more consistently than any clinical grouping would predict: income and college attainment
          run cool (protective) down almost the entire list; ADI and poverty run warm.
        </p>

        <StoryFig
          title="What tracks each measure"
          sub="Spearman ρ of each measure with ten demographic context variables — hover any cell"
          caption={
            <>
              Age 65+ is the great exception: it flips sign depending on whether a condition
              accumulates with age (cancer, heart disease) or concentrates among the young (loneliness,
              skipped checkups, housing insecurity). That split is exactly the second principal axis in{" "}
              <a href="/stories/one-axis/">the one-axis story</a>.
            </>
          }
        >
          <ContextHeatmap data={corr} />
        </StoryFig>

        <p>
          The practical upshot: a ZIP code flagged for any one of these measures should usually be
          flagged for a dozen. Single-condition programs are aiming at a correlated bundle — which is
          either discouraging (everything is connected to everything) or encouraging (helping one
          probably helps the rest), depending on the intervention.
        </p>

        <StoryCaveat />
        <StoryNext current="connected" />
      </article>
    </main>
  );
}

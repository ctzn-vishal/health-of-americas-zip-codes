import type { Metadata } from "next";
import { OutcomeMap, StateStrip } from "@/components/stories/OutcomePanels";
import { SmokingScatter } from "@/components/stories/OutcomeScatters";
import { StoryCaveat, StoryFig, StoryHead, StoryNext } from "@/components/stories/StoryShell";
import { getSmoking } from "@/lib/serverData";
import { STORIES } from "@/lib/stories";

const story = STORIES.find((s) => s.slug === "tobacco-belt")!;

export const metadata: Metadata = { title: story.title, description: story.dek };

export default async function TobaccoBeltStory() {
  const sm = await getSmoking();
  const under = sm.states.slice(0, 3);
  const over = sm.states.slice(-3).reverse();

  return (
    <main id="main" className="story-wrap">
      <StoryHead
        story={story}
        meta={`Smoking vs Area Deprivation Index, quadratic fit + residuals · ${sm.n.toLocaleString()} ZIP/ZCTA areas`}
      />
      <article className="story-body">
        <p>
          Of all 26 measures, none follows neighborhood deprivation as tightly as cigarette smoking:{" "}
          <strong className="big-number">ρ = {sm.rho_adi}</strong> with the Area Deprivation Index
          across ZIP codes. Know a neighborhood&apos;s ADI and you can predict its smoking rate
          remarkably well. Which makes the <em>failures</em> of that prediction the interesting part —
          they isolate everything deprivation can&apos;t explain.
        </p>

        <StoryFig
          title="Smoking against deprivation"
          sub="Each dot is a ZIP code; the line is the quadratic fit used to compute residuals — hover for the ZIP"
          caption={
            <>
              The relationship steepens at the deprived end: each step deeper into deprivation buys
              more additional smoking. Residuals below measure each ZIP&apos;s distance from this
              line.
            </>
          }
        >
          <SmokingScatter />
        </StoryFig>

        <h2>Subtract poverty, and history remains</h2>
        <p>
          Map the residual — actual smoking minus deprivation-predicted smoking — and the income map
          of America disappears, replaced by a cultural one. The contiguous red mass is the{" "}
          <strong>tobacco belt</strong>: Tennessee (+{over.find((s) => s.state === "TN")?.resid ?? over[0].resid}
          {" "}points), Kentucky, West Virginia — places that grew tobacco, worked it, and smoke more
          than their economics alone would predict. Nevada and Alaska join them by a different route
          (casino and frontier culture). On the blue side, <strong>Utah smokes{" "}
          {Math.abs(under.find((s) => s.state === "UT")?.resid ?? under[0].resid)} points less</strong>{" "}
          than its deprivation predicts — the LDS effect — joined by heavily Hispanic border areas and
          immigrant metros, consistent with the well-documented immigrant smoking advantage.
        </p>

        <StoryFig
          title="The residual map: smoking minus what deprivation predicts"
          sub="Red = smokes more than predicted · blue = less"
          caption={
            <>
              This is the map of smoking <em>culture</em> — regional norms, religion, tobacco
              heritage, and policy (tax differentials between neighboring states are visible along
              several borders).
            </>
          }
        >
          <OutcomeMap src="smoking" />
        </StoryFig>

        <StoryFig
          title="State residuals, ranked"
          sub="Population-weighted average residual (percentage points of smoking prevalence)"
          caption={
            <>
              {over.map((s) => `${s.state} +${s.resid}`).join(", ")} smoke the most above prediction;{" "}
              {under.map((s) => `${s.state} ${s.resid}`).join(", ")} the most below. For a measure
              this strongly determined by deprivation, multi-point state-level departures are large.
            </>
          }
        >
          <StateStrip
            rows={sm.states.map((s) => ({ state: s.state, v: s.resid }))}
            center={0}
            fmtKind="signed"
            label="Smoking residual"
          />
        </StoryFig>

        <p>
          The policy reading: deprivation sets the baseline, but the residuals prove smoking is not
          economically fated. Utah&apos;s ZIP codes face the same prices and the same stress gradients
          as everyone else&apos;s — norms moved the number anyway. What culture can do, policy and
          cessation infrastructure have room to do too, and the red residual states are the map of
          where that headroom is largest.
        </p>

        <StoryCaveat />
        <StoryNext current="tobacco-belt" />
      </article>
    </main>
  );
}

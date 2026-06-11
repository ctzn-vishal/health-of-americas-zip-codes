import type { Metadata } from "next";
import { OutcomeMap, StateStrip } from "@/components/stories/OutcomePanels";
import { MentalHealthScatter } from "@/components/stories/OutcomeScatters";
import { StoryCaveat, StoryFig, StoryHead, StoryNext } from "@/components/stories/StoryShell";
import { getMentalHealth } from "@/lib/serverData";
import { STORIES } from "@/lib/stories";

const story = STORIES.find((s) => s.slug === "diagnosis-gap")!;

export const metadata: Metadata = { title: story.title, description: story.dek };

export default async function DiagnosisGapStory() {
  const mh = await getMentalHealth();
  const lo = mh.states.slice(0, 3);
  const hi = mh.states.slice(-3).reverse();

  return (
    <main id="main" className="story-wrap">
      <StoryHead
        story={story}
        meta={`Diagnosed depression vs frequent mental distress · ${mh.n.toLocaleString()} ZIP/ZCTA areas`}
      />
      <article className="story-body">
        <p>
          The atlas carries two mental-health measures that sound interchangeable and are not.{" "}
          <strong>Frequent mental distress</strong> asks whether people report 14+ bad mental-health
          days a month — a symptom. <strong>Diagnosed depression</strong> asks whether a clinician has
          ever told them they have depression — a symptom <em>that was seen</em>. Across ZIP codes the
          two correlate at only ρ = {mh.corr.dep_vs_dis}, and they answer to different masters:
          distress tracks deprivation (ρ = {mh.corr.dis.adi} with ADI, {mh.corr.dis.income} with
          income), while diagnosed depression barely does (ρ = {mh.corr.dep.adi} and{" "}
          {mh.corr.dep.income}).
        </p>

        <StoryFig
          title="Diagnosis vs distress, ZIP by ZIP"
          sub="Each dot is a ZIP code, colored by median household income — hover for the ZIP"
          caption={
            <>
              Nationally there are about <strong>{mh.national_ratio} diagnoses per unit of
              distress</strong> (the dashed line marks 1:1). Look along any vertical slice: at the
              same level of distress, bluer (higher-income) ZIP codes sit higher — more of their
              distress has been converted into a diagnosis.
            </>
          }
        >
          <MentalHealthScatter />
        </StoryFig>

        <h2>The diagnosis ratio is a privilege gradient</h2>
        <p>
          Divide diagnosed depression by distress and you get a crude but revealing index: how much
          of a place&apos;s misery has been clinically recognized. That ratio rises with income
          (ρ = +{mh.corr.ratio.income}) and college attainment (+{mh.corr.ratio.college}), and falls
          where more residents are Black (<strong className="big-number">ρ = {mh.corr.ratio.black}</strong>) —
          the strongest demographic association the ratio has. The literature&apos;s explanation is
          well-documented: differential access to care, differential help-seeking, and differential
          clinician recognition. The geography here is consistent with all three.
        </p>

        <StoryFig
          title="Diagnoses per unit of distress, mapped"
          sub="Red = less diagnosis than the national ratio for the distress present · blue = more"
          caption={
            <>
              The Deep South and immigrant-dense metros run red (high distress, comparatively few
              diagnoses); the Pacific Northwest, Upper Midwest, and New England run blue. This is{" "}
              <em>not</em> a map of mental illness — it is a map of recognition.
            </>
          }
        >
          <OutcomeMap src="mental_health" />
        </StoryFig>

        <StoryFig
          title="Every state's diagnosis ratio"
          sub="Population-weighted diagnosed depression ÷ frequent mental distress"
          caption={
            <>
              {hi.map((s) => s.state).join(", ")} convert distress into diagnosis at the highest
              rates ({hi[0].ratio}, {hi[1].ratio}, {hi[2].ratio}); {lo.map((s) => s.state).join(", ")}{" "}
              at the lowest ({lo[0].ratio}–{lo[2].ratio}). A state can simultaneously have low
              distress and high diagnosis — that is the access signature.
            </>
          }
        >
          <StateStrip
            rows={mh.states.map((s) => ({ state: s.state, v: s.ratio }))}
            center={mh.national_ratio}
            fmtKind="ratio"
            label="Diagnosis ratio"
          />
        </StoryFig>

        <p>
          The caveat cuts both ways and deserves emphasis: a high ratio can mean good access{" "}
          <em>or</em> over-diagnosis; a low one can mean unmet need <em>or</em> genuine resilience.
          What the data rules out is reading &ldquo;diagnosed depression&rdquo; as a clean map of
          suffering — it is suffering filtered through the health system that did, or did not, see it.
        </p>

        <StoryCaveat />
        <StoryNext current="diagnosis-gap" />
      </article>
    </main>
  );
}

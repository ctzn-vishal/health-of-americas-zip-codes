import type { Metadata } from "next";
import GradientSlopes from "@/components/stories/GradientSlopes";
import { StoryCaveat, StoryFig, StoryHead, StoryNext } from "@/components/stories/StoryShell";
import { getGradients } from "@/lib/serverData";
import { STORIES } from "@/lib/stories";

const story = STORIES.find((s) => s.slug === "gradient")!;

export const metadata: Metadata = { title: story.title, description: story.dek };

export default async function GradientStory() {
  const grad = await getGradients();
  const byId = new Map(grad.metrics.map((m) => [m.id, m]));
  const teeth = byId.get("teethlost")!;
  const utility = byId.get("utility_threat")!;
  const smoking = byId.get("smoking")!;
  const binge = byId.get("binge")!;
  const cancer = byId.get("cancer")!;
  const loneliness = byId.get("loneliness")!;
  const steep = grad.metrics.filter((m) => (m.rel ?? 0) >= 2).length;

  return (
    <main id="main" className="story-wrap">
      <StoryHead
        story={story}
        meta="Population-weighted means by Area Deprivation Index decile · all 26 measures on one scale"
      />
      <article className="story-body">
        <p>
          Sort America&apos;s neighborhoods into ten bins by the Area Deprivation Index and walk from
          the least-deprived tenth to the most-deprived. How much worse does each measure get? Putting
          all 26 on a single relative scale — each line starts at 1.0× in the least-deprived decile —
          makes the answer legible at a glance: <strong className="big-number">{steep} of the 26
          measures at least double</strong> by the time you reach the most-deprived tenth.
        </p>

        <StoryFig
          title="The deprivation gradient, all 26 measures at once"
          sub="Burden relative to the least-deprived decile (log scale) — hover a line or label to isolate it"
          caption={
            <>
              Population-weighted means per ADI national-rank decile. The steepest line is{" "}
              <strong>complete tooth loss among seniors</strong>: from {teeth.d[0]}% in the
              least-deprived decile to {teeth.d[9]}% in the most-deprived — {teeth.rel}× higher.
              Utility-shutoff threat ({utility.rel}×) and smoking ({smoking.rel}×) follow.
            </>
          }
        >
          <GradientSlopes data={grad} />
        </StoryFig>

        <h2>Teeth are the body's deprivation index</h2>
        <p>
          It is fitting that the steepest gradient belongs to dentistry. Complete tooth loss is
          cumulative, cheap to prevent, expensive to treat, poorly covered by insurance, and almost
          perfectly classed — which makes a senior&apos;s smile one of the most legible records of a
          lifetime of neighborhood deprivation that epidemiology has.
        </p>

        <h2>What the gradient leaves alone</h2>
        <p>
          Three lines barely move, and each is a lesson. <strong>Cancer prevalence</strong> ({cancer.rel}×)
          is nearly flat because it mostly tracks age, and deprived neighborhoods skew younger —
          flatness here is an artifact of <em>who lives where</em>, not equity in cancer risk.{" "}
          <strong>Loneliness</strong> ({loneliness.rel}×) is almost evenly distributed: the most
          isolated places in America are not the poorest, they are the youngest and densest. And{" "}
          <strong>binge drinking runs backwards</strong> ({binge.rel}× — that is, {Math.round((1 - (binge.rel ?? 1)) * 100)}%{" "}
          <em>lower</em> in the most-deprived decile), the one health behavior that rises with
          affluence.
        </p>
        <p>
          The gradient, in other words, is not a law of nature that drags every measure equally. It
          bites hardest where prevention is priced out of reach — and it spares the burdens that
          answer to age and density instead of income.
        </p>

        <StoryCaveat />
        <StoryNext current="gradient" />
      </article>
    </main>
  );
}

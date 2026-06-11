import type { Metadata } from "next";
import WealthHealthGaps, {
  WealthCorrelationGrid,
  WealthDecileLines,
  WealthScoreProfile,
} from "@/components/stories/WealthGapCharts";
import { StoryCaveat, StoryFig, StoryHead, StoryNext } from "@/components/stories/StoryShell";
import { fmtPop } from "@/lib/format";
import { getWealthGap } from "@/lib/serverData";
import { STORIES } from "@/lib/stories";

const story = STORIES.find((s) => s.slug === "wealth-gap")!;

export const metadata: Metadata = { title: story.title, description: story.dek };

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function pct(v: number | null | undefined, digits = 1) {
  return v == null ? "-" : `${v.toFixed(digits)}%`;
}

function num(v: number | null | undefined, digits = 0) {
  return v == null ? "-" : v.toFixed(digits);
}

export default async function WealthGapStory() {
  const wealth = await getWealthGap();
  const groups = Object.fromEntries(wealth.groups.map((g) => [g.id, g]));
  const bottom = groups.bottom;
  const top = groups.top;
  const byMetric = new Map(wealth.metrics.map((m) => [m.id, m]));
  const noDental = byMetric.get("no_dental_visit")!;
  const food = byMetric.get("food_insecurity")!;
  const teeth = byMetric.get("teethlost")!;
  const smoking = byMetric.get("smoking")!;
  const binge = byMetric.get("binge")!;
  const cancer = byMetric.get("cancer")!;
  const noCheckup = byMetric.get("no_checkup")!;

  return (
    <main id="main" className="story-wrap">
      <StoryHead
        story={story}
        meta={`Composite socioeconomic advantage score · ${wealth.n.toLocaleString()} complete resident ZIP/ZCTA areas · top and bottom deciles`}
      />
      <article className="story-body">
        <p>
          ZIP-code data does not contain household net worth. It does contain a thick set of proxies
          for neighborhood advantage: income, education, housing values, poverty, unemployment, and
          the Area Deprivation Index. Start there and a hard pattern appears. The places at the top of
          the socioeconomic ladder are not just richer. They are healthier on almost every measure the
          atlas tracks.
        </p>
        <p>
          In this story, <strong className="big-number">{wealth.score.worse_count} of the 26 health
          measures are worse in the bottom wealth decile</strong>. The three exceptions are instructive:
          binge drinking is higher in affluent ZIP codes, cancer is more common in older affluent places,
          and skipped annual checkups is slightly higher in the top decile.
        </p>

        <h2>The wealth signals agree, but not perfectly</h2>
        <p>
          Median income is the strongest single proxy for the final score, but it is not the whole
          story. College attainment, home value, ADI, poverty, and unemployment all capture different
          parts of neighborhood advantage. The matrix below is the first check: if the proxies did not
          move together, a composite score would be a false precision machine. They do move together,
          though with enough daylight between them to justify using more than income alone.
        </p>

        <StoryFig
          title="Six ways of seeing neighborhood wealth"
          sub="Spearman rank correlations across eligible ZIP/ZCTA areas; warm moves together, cool moves opposite"
          caption={
            <>
              Raw correlations use each measure as observed, so income and ADI run in opposite
              directions. The small gold bars show each measure&apos;s correlation with the aligned
              composite score after reversing ADI, poverty, and unemployment.
            </>
          }
        >
          <WealthCorrelationGrid data={wealth} />
        </StoryFig>

        <h2>So the split is a composite, not a single cutoff</h2>
        <p>
          Each eligible ZIP/ZCTA is ranked from 0 to 100 on six aligned indicators: higher income,
          higher college attainment, higher home value, lower ADI, lower poverty, and lower
          unemployment. The six ranks are averaged. The bottom decile is the lowest tenth of ZIP/ZCTA
          areas on that average; the top decile is the highest tenth. This keeps one strange variable
          from deciding the story.
        </p>
        <p>
          The resulting groups are stark. The bottom decile has an average median household income of{" "}
          <strong>{money.format(bottom.components.income.raw ?? 0)}</strong>, home value of{" "}
          <strong>{money.format(bottom.components.home_value.raw ?? 0)}</strong>, ADI rank of{" "}
          <strong>{num(bottom.components.adi.raw)}</strong>, and poverty of{" "}
          <strong>{pct(bottom.components.poverty.raw)}</strong>. The top decile averages{" "}
          <strong>{money.format(top.components.income.raw ?? 0)}</strong> income,{" "}
          <strong>{money.format(top.components.home_value.raw ?? 0)}</strong> home value, ADI{" "}
          <strong>{num(top.components.adi.raw)}</strong>, and poverty{" "}
          <strong>{pct(top.components.poverty.raw)}</strong>.
        </p>

        <StoryFig
          title="How the top and bottom deciles are defined"
          sub="Each row is an aligned percentile rank; right means more socioeconomic advantage"
          caption={
            <>
              Deciles are by ZIP/ZCTA count, not population. The bottom decile contains{" "}
              {bottom.n.toLocaleString()} ZIP/ZCTA areas and {fmtPop(bottom.population)} people in the
              complete-case frame; the top decile contains {top.n.toLocaleString()} areas and{" "}
              {fmtPop(top.population)} people.
            </>
          }
        >
          <WealthScoreProfile data={wealth} />
        </StoryFig>

        <h2>The health gap opens before the bottom</h2>
        <p>
          Moving from the poorest decile to the wealthiest decile does not simply shave a few points
          off the tail risks. Some measures steadily unwind across the ladder. Food insecurity,
          smoking, obesity, diabetes, and tooth loss all fall as the score rises. Binge drinking moves
          the other way, a reminder that wealth changes the risk mix rather than magically improving
          every behavior.
        </p>

        <StoryFig
          title="Selected measures across the wealth ladder"
          sub="Population-weighted mean prevalence by composite wealth decile"
          caption={
            <>
              The line chart is not used to define the top and bottom groups; it shows that the
              decile split is the end of a broader gradient. Binge drinking is the clearest reversal.
            </>
          }
        >
          <WealthDecileLines data={wealth} />
        </StoryFig>

        <h2>The bottom decile carries the burdens money can buy down</h2>
        <p>
          The biggest absolute gap is dental care. In the wealthiest tenth,{" "}
          <strong>{pct(noDental.top)}</strong> of adults are estimated to have gone without a recent
          dental visit; in the bottom tenth, it is <strong>{pct(noDental.bottom)}</strong>. Food
          insecurity is <strong>{food.ratio?.toFixed(1)}x</strong> higher, complete tooth loss among
          seniors is <strong>{teeth.ratio?.toFixed(1)}x</strong> higher, and smoking is{" "}
          <strong>{smoking.ratio?.toFixed(1)}x</strong> higher.
        </p>
        <p>
          This is the central finding: the rich-poor ZIP-code comparison is not one disease story.
          It is a bundle. The bottom wealth decile has more chronic disease, more disability, more
          social need, more untreated oral-health risk, and more everyday barriers to prevention.
        </p>

        <StoryFig
          title="Top tenth versus bottom tenth, all 26 measures"
          sub="Population-weighted mean prevalence; red dot is bottom wealth decile, blue dot is top wealth decile"
          caption={
            <>
              Positive gaps mean the bottom wealth decile is worse. The three negative gaps are{" "}
              {noCheckup.short.toLowerCase()} ({pct(noCheckup.bottom)} bottom vs {pct(noCheckup.top)} top),{" "}
              {cancer.short.toLowerCase()} ({pct(cancer.bottom)} vs {pct(cancer.top)}), and{" "}
              {binge.short.toLowerCase()} ({pct(binge.bottom)} vs {pct(binge.top)}).
            </>
          }
        >
          <WealthHealthGaps data={wealth} />
        </StoryFig>

        <h2>What the comparison can and cannot say</h2>
        <p>
          This is a place-level comparison. It does not say that a richer person is healthier than a
          poorer person inside the same ZIP code, and it does not prove wealth causes every gap. It
          says something more spatial: America has ZIP codes where socioeconomic advantage piles up,
          and those same places tend to carry much lower health burden. The public-health target is
          not just one condition. It is the structure that lets many conditions cluster.
        </p>

        <StoryCaveat />
        <StoryNext current="wealth-gap" />
      </article>
    </main>
  );
}

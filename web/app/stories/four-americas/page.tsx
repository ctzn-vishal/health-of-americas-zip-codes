import type { Metadata } from "next";
import ArchetypeProfiles from "@/components/stories/ArchetypeProfiles";
import DotMap from "@/components/stories/DotMap";
import { StoryCaveat, StoryFig, StoryHead, StoryNext } from "@/components/stories/StoryShell";
import { getArchetypes } from "@/lib/serverData";
import { STORIES } from "@/lib/stories";

const story = STORIES.find((s) => s.slug === "four-americas")!;

export const metadata: Metadata = { title: story.title, description: story.dek };

const fmtM = (n: number) => `${Math.round(n / 1e6)} million`;

export default async function FourAmericasStory() {
  const arch = await getArchetypes();
  const [suburbs, metro, towns, leftBehind] = arch.clusters;

  return (
    <main id="main" className="story-wrap">
      <StoryHead
        story={story}
        meta={`k-means on all 26 standardized measures (fit on ${arch.n.toLocaleString()} complete-case areas, k = ${arch.k} by silhouette) · ${arch.n_assigned.toLocaleString()} areas assigned`}
      />
      <article className="story-body">
        <p>
          Instead of ranking ZIP codes from healthiest to sickest, ask a different question:{" "}
          <em>what kinds of places exist?</em>{" "}
          Cluster every ZIP code on all 26 measures
          simultaneously — no demographics allowed in — and the algorithm lands on four archetypes.
          Demographics weren&apos;t used to build them, yet each cluster snaps onto a recognizable
          American landscape.
        </p>

        <StoryFig
          title="Four kinds of communities"
          sub="ZIP centroids colored by cluster assignment"
          caption={
            <>
              The geography is not random: comfortable suburbs ring the metros, young metro strivers
              fill the urban cores and inner suburbs, aging small towns cover the rural Midwest and
              Mountain West, and left-behind communities concentrate across the South and Appalachia.
              Clusters are fit on areas with complete data; areas observing at least 18 of the 26
              measures are then assigned to their nearest archetype, so the map covers{" "}
              {arch.n_assigned.toLocaleString()} of 32,409 ZIP/ZCTA areas.
            </>
          }
        >
          <DotMap mode="cluster" archLabels={arch.clusters.map((c) => c.label)} />
        </StoryFig>

        <StoryFig
          title="Each archetype's fingerprint"
          sub="Bars show each measure's deviation from the U.S. ZIP-level norm (in standard deviations) — hover for details"
          caption={
            <>
              Fingerprints are read against the national norm: bars above the line mean more burden
              than typical, below mean less. Exemplar ZIPs are large-population areas closest to each
              cluster&apos;s center — click one to open its snapshot.
            </>
          }
        >
          <ArchetypeProfiles data={arch} />
        </StoryFig>

        <h2>The cluster that breaks the income story</h2>
        <p>
          Three of the four clusters line up with the deprivation axis: {suburbs.label.toLowerCase()}{" "}
          ({fmtM(suburbs.pop_assigned)} people) sit below the norm on nearly everything,{" "}
          {towns.label.toLowerCase()} ({fmtM(towns.pop_assigned)}) sit moderately above,{" "}
          {leftBehind.label.toLowerCase()} ({fmtM(leftBehind.pop_assigned)}) far above. The fourth
          refuses to fit. <strong>{metro.label}</strong> — {fmtM(metro.pop_assigned)} people in
          dense, young, diverse ZIP codes — score <em>better</em> than the comfortable suburbs on
          cancer and heart disease,
          and dramatically <em>worse</em> on loneliness ({metro.z.loneliness! >= 0 ? "+" : ""}
          {metro.z.loneliness} SD), skipped checkups (+{metro.z.no_checkup} SD), lack of insurance
          (+{metro.z.uninsured} SD), and social support.
        </p>
        <p>
          Much of the chronic-disease advantage is simply age structure — only {metro.context.age65}%
          of their residents are 65+, versus {towns.context.age65}% in the aging small towns. The
          social strain is not an age artifact. It is the second axis of American place-based health:
          being young and urban protects your arteries and starves your support network.
        </p>

        <h2>A fraction of the population, most of the burden</h2>
        <p>
          {leftBehind.label} hold {fmtM(leftBehind.pop_assigned)} people — the smallest of the four groups —
          yet they sit {leftBehind.z.ghlth}+ standard deviations above the norm on self-rated poor
          health and food insecurity alike, with median household income of about $
          {Math.round((leftBehind.context.income ?? 0) / 1000)}k against the suburbs&apos; $
          {Math.round((suburbs.context.income ?? 0) / 1000)}k. Every burden the atlas tracks, this
          cluster carries at once — the statistical portrait of compounding disadvantage.
        </p>

        <StoryCaveat />
        <StoryNext current="four-americas" />
      </article>
    </main>
  );
}

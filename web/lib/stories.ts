// Registry for the data-driven articles under /stories. Server-safe (no browser APIs).

export interface StoryDef {
  slug: string;
  kicker: string;
  title: string;
  dek: string;
}

export const STORIES: StoryDef[] = [
  {
    slug: "one-axis",
    kicker: "The structure of place-based health",
    title: "Most of ZIP-code health is one axis",
    dek: "Run a principal component analysis on all 26 measures and a single dimension — tracking deprivation and income, not any one disease — explains the majority of the variation between America's ZIP codes.",
  },
  {
    slug: "connected",
    kicker: "Correlation structure",
    title: "No measure moves alone",
    dek: "Diabetes predicts blood pressure. Food insecurity predicts housing insecurity at ρ ≈ 0.97. The 26 measures form tight blocks — and the blocks track demographics more than medicine.",
  },
  {
    slug: "four-americas",
    kicker: "Community archetypes",
    title: "The four health Americas",
    dek: "Cluster ZIP codes on all 26 measures at once and four recognizable kinds of community emerge — comfortable suburbs, young metro strivers, aging small towns, and left-behind communities.",
  },
  {
    slug: "gradient",
    kicker: "The deprivation gradient",
    title: "Where the gradient bites — and where it doesn't",
    dek: "Complete tooth loss is three times higher in the most-deprived tenth of neighborhoods. Binge drinking is the one measure that runs the other way.",
  },
  {
    slug: "wealth-gap",
    kicker: "The wealth gradient",
    title: "The health premium of wealthy ZIP codes",
    dek: "Rank ZIP/ZCTA areas by a composite of income, college attainment, home value, ADI, poverty, and unemployment, then compare the richest tenth with the poorest tenth across all 26 health measures.",
  },
  {
    slug: "diagnosis-gap",
    kicker: "Outcome story · mental health",
    title: "Distress follows poverty. Diagnosis follows privilege.",
    dek: "Frequent mental distress tracks deprivation closely; diagnosed depression barely does. The gap between the two — diagnoses per unit of distress — rises with income and falls sharply where more residents are Black.",
  },
  {
    slug: "tobacco-belt",
    kicker: "Outcome story · smoking",
    title: "Smoking: deprivation predicts it, culture bends it",
    dek: "No measure tracks neighborhood deprivation more tightly than smoking (ρ = 0.80). Subtract that prediction and what remains is a map of history: the tobacco belt, Utah, and the casino frontier.",
  },
];

export const storyPath = (slug: string) => `/stories/${slug}/`;

export interface Scenario {
  name: string;
  totalStock: number;
  uniqueUsers: number;
  /** One entry per HTTP request to fire; a userId may repeat. */
  buildUserIds(): string[];
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const SCENARIOS: Scenario[] = [
  {
    // Proves no-oversell: far more buyers than stock, racing at once.
    name: "A: 10,000 unique users racing for 100 units",
    totalStock: 100,
    uniqueUsers: 10_000,
    buildUserIds: () => Array.from({ length: 10_000 }, (_, i) => `scenario-a-user-${i}`),
  },
  {
    // Proves one-per-user: a single user hammering the endpoint.
    name: "B: 1 user firing 1,000 concurrent purchase attempts",
    totalStock: 50,
    uniqueUsers: 1,
    buildUserIds: () => Array.from({ length: 1000 }, () => "scenario-b-single-user"),
  },
  {
    // Proves both at once, like impatient users double- and
    // triple-clicking "Buy Now" while stock is actually running out.
    name: "C: 5,000 users each retrying 3x against 2,000 units",
    totalStock: 2000,
    uniqueUsers: 5000,
    buildUserIds: () => {
      const ids: string[] = [];
      for (let i = 0; i < 5000; i++) {
        ids.push(`scenario-c-user-${i}`, `scenario-c-user-${i}`, `scenario-c-user-${i}`);
      }
      return shuffle(ids);
    },
  },
];

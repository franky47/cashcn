import { z } from "zod";

// zod schemas for external JSON (npm registry, GitHub GraphQL). Schemas are
// camelCase; inferred types are PascalCase. z.object strips unknown keys, so we
// only declare the fields cashcn reads — the responses carry many more.

const npmFundingEntry = z.union([z.string(), z.object({ url: z.string() })]);

export const npmPackageResponse = z.object({
  funding: z.union([npmFundingEntry, z.array(npmFundingEntry)]).optional(),
  repository: z.union([z.string(), z.object({ url: z.string() })]).optional(),
});
export type NpmPackageResponse = z.infer<typeof npmPackageResponse>;

const sponsorsTierNode = z.object({
  monthlyPriceInDollars: z.number(),
  isOneTime: z.boolean().nullish(),
  id: z.string(),
});

const sponsorsRoot = z
  .object({
    sponsorsListing: z.object({ tiers: z.object({ nodes: z.array(sponsorsTierNode) }) }).nullish(),
  })
  .nullish();

export const sponsorsGraphqlResponse = z.object({
  data: z.object({ user: sponsorsRoot, organization: sponsorsRoot }).partial().nullish(),
});

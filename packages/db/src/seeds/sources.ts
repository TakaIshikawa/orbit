/**
 * Seed file for managed sources
 *
 * Run with: npx tsx packages/db/src/seeds/sources.ts
 */

import { getDatabase } from "../client.js";
import { managedSources, calculateDebiasedScore, calculateOverallCredibility } from "../schema/managed-sources.js";
import { generateId } from "@orbit/core";

interface SourceSeed {
  domain: string;
  name: string;
  url: string;
  description: string;
  sourceType: "research" | "news" | "government" | "ngo" | "think_tank" | "industry" | "aggregator" | "preprint" | "other";
  incentiveType: "academic" | "nonprofit" | "commercial" | "government" | "advocacy" | "wire_service" | "aggregator" | "platform" | "independent";
  domains: string[];
  // Assessment metrics
  factualAccuracy: number;
  methodologicalRigor: number;
  transparencyScore: number;
  independenceScore: number;
  ideologicalTransparency: number;
  fundingTransparency: number;
  conflictDisclosure: number;
  perspectiveDiversity: number;
  geographicNeutrality: number;
  temporalNeutrality: number;
  selectionBiasResistance: number;
  quantificationBias: number;
  tags: string[];
}

const SOURCES: SourceSeed[] = [
  // ============================================================================
  // Existing Sources
  // ============================================================================
  {
    domain: "ourworldindata.org",
    name: "Our World in Data",
    url: "https://ourworldindata.org",
    description: "Research and data to make progress against the world's largest problems",
    sourceType: "aggregator",
    incentiveType: "nonprofit",
    domains: ["health", "economics", "climate", "poverty", "education"],
    factualAccuracy: 0.92,
    methodologicalRigor: 0.90,
    transparencyScore: 0.95,
    independenceScore: 0.85,
    ideologicalTransparency: 0.90,
    fundingTransparency: 0.95,
    conflictDisclosure: 0.90,
    perspectiveDiversity: 0.75,
    geographicNeutrality: 0.80,
    temporalNeutrality: 0.85,
    selectionBiasResistance: 0.80,
    quantificationBias: 0.75,
    tags: ["data", "visualization", "global"],
  },
  {
    domain: "arxiv.org",
    name: "arXiv",
    url: "https://arxiv.org",
    description: "Open-access archive for scholarly articles in physics, mathematics, computer science, and more",
    sourceType: "preprint",
    incentiveType: "academic",
    domains: ["science", "technology", "mathematics", "physics"],
    factualAccuracy: 0.75, // Preprints not peer-reviewed
    methodologicalRigor: 0.70,
    transparencyScore: 0.90,
    independenceScore: 0.85,
    ideologicalTransparency: 0.80,
    fundingTransparency: 0.70,
    conflictDisclosure: 0.65,
    perspectiveDiversity: 0.85,
    geographicNeutrality: 0.70,
    temporalNeutrality: 0.90,
    selectionBiasResistance: 0.85,
    quantificationBias: 0.80,
    tags: ["preprint", "open-access", "science"],
  },

  // ============================================================================
  // Phase 1: Priority Data Sources
  // ============================================================================
  {
    domain: "worldbank.org",
    name: "World Bank Open Data",
    url: "https://data.worldbank.org",
    description: "Free and open access to global development data from the World Bank",
    sourceType: "government",
    incentiveType: "government",
    domains: ["economics", "poverty", "health", "education", "climate", "infrastructure"],
    factualAccuracy: 0.95,
    methodologicalRigor: 0.92,
    transparencyScore: 0.90,
    independenceScore: 0.75, // Intergovernmental
    ideologicalTransparency: 0.70,
    fundingTransparency: 0.85,
    conflictDisclosure: 0.75,
    perspectiveDiversity: 0.70,
    geographicNeutrality: 0.85,
    temporalNeutrality: 0.90,
    selectionBiasResistance: 0.80,
    quantificationBias: 0.70,
    tags: ["official-statistics", "development", "global"],
  },
  {
    domain: "who.int",
    name: "WHO Global Health Observatory",
    url: "https://www.who.int/data/gho",
    description: "WHO's gateway to health-related statistics for 194 member states",
    sourceType: "government",
    incentiveType: "government",
    domains: ["health", "public_health", "disease", "mortality"],
    factualAccuracy: 0.94,
    methodologicalRigor: 0.90,
    transparencyScore: 0.88,
    independenceScore: 0.70, // UN agency
    ideologicalTransparency: 0.65,
    fundingTransparency: 0.80,
    conflictDisclosure: 0.70,
    perspectiveDiversity: 0.65,
    geographicNeutrality: 0.90,
    temporalNeutrality: 0.85,
    selectionBiasResistance: 0.75,
    quantificationBias: 0.70,
    tags: ["official-statistics", "health", "global"],
  },
  {
    domain: "cochranelibrary.com",
    name: "Cochrane Library",
    url: "https://www.cochranelibrary.com",
    description: "Gold standard systematic reviews and meta-analyses in healthcare",
    sourceType: "research",
    incentiveType: "nonprofit",
    domains: ["health", "medicine", "public_health"],
    factualAccuracy: 0.96,
    methodologicalRigor: 0.98, // Gold standard
    transparencyScore: 0.95,
    independenceScore: 0.90,
    ideologicalTransparency: 0.90,
    fundingTransparency: 0.92,
    conflictDisclosure: 0.95,
    perspectiveDiversity: 0.85,
    geographicNeutrality: 0.80,
    temporalNeutrality: 0.85,
    selectionBiasResistance: 0.95,
    quantificationBias: 0.90,
    tags: ["systematic-review", "evidence-based", "healthcare"],
  },
  {
    domain: "reuters.com",
    name: "Reuters",
    url: "https://www.reuters.com",
    description: "International news organization with global reach and fact-checking unit",
    sourceType: "news",
    incentiveType: "wire_service",
    domains: ["economics", "politics", "technology", "health", "climate"],
    factualAccuracy: 0.88,
    methodologicalRigor: 0.82,
    transparencyScore: 0.80,
    independenceScore: 0.75,
    ideologicalTransparency: 0.70,
    fundingTransparency: 0.65,
    conflictDisclosure: 0.70,
    perspectiveDiversity: 0.80,
    geographicNeutrality: 0.85,
    temporalNeutrality: 0.60, // News is inherently recent
    selectionBiasResistance: 0.75,
    quantificationBias: 0.65,
    tags: ["wire-service", "fact-check", "global-news"],
  },

  // ============================================================================
  // Phase 2: Research Sources
  // ============================================================================
  {
    domain: "ncbi.nlm.nih.gov",
    name: "PubMed",
    url: "https://pubmed.ncbi.nlm.nih.gov",
    description: "Free search engine accessing primarily the MEDLINE database of biomedical literature",
    sourceType: "research",
    incentiveType: "government",
    domains: ["health", "medicine", "biology", "genetics"],
    factualAccuracy: 0.90,
    methodologicalRigor: 0.88,
    transparencyScore: 0.85,
    independenceScore: 0.80,
    ideologicalTransparency: 0.75,
    fundingTransparency: 0.80,
    conflictDisclosure: 0.85,
    perspectiveDiversity: 0.85,
    geographicNeutrality: 0.70,
    temporalNeutrality: 0.85,
    selectionBiasResistance: 0.80,
    quantificationBias: 0.75,
    tags: ["peer-reviewed", "biomedical", "NIH"],
  },
  {
    domain: "nber.org",
    name: "NBER Working Papers",
    url: "https://www.nber.org",
    description: "National Bureau of Economic Research - premier source for economics research",
    sourceType: "research",
    incentiveType: "academic",
    domains: ["economics", "finance", "labor", "health", "policy"],
    factualAccuracy: 0.85, // Working papers
    methodologicalRigor: 0.90,
    transparencyScore: 0.88,
    independenceScore: 0.80,
    ideologicalTransparency: 0.70,
    fundingTransparency: 0.75,
    conflictDisclosure: 0.80,
    perspectiveDiversity: 0.75,
    geographicNeutrality: 0.60, // US-focused
    temporalNeutrality: 0.85,
    selectionBiasResistance: 0.80,
    quantificationBias: 0.75,
    tags: ["working-paper", "economics", "research"],
  },
  {
    domain: "brookings.edu",
    name: "Brookings Institution",
    url: "https://www.brookings.edu",
    description: "American research group conducting research on economics, governance, and foreign policy",
    sourceType: "think_tank",
    incentiveType: "nonprofit",
    domains: ["policy", "economics", "governance", "foreign_policy"],
    factualAccuracy: 0.85,
    methodologicalRigor: 0.82,
    transparencyScore: 0.80,
    independenceScore: 0.70,
    ideologicalTransparency: 0.75, // Center-left lean
    fundingTransparency: 0.70,
    conflictDisclosure: 0.75,
    perspectiveDiversity: 0.70,
    geographicNeutrality: 0.55, // US-focused
    temporalNeutrality: 0.75,
    selectionBiasResistance: 0.70,
    quantificationBias: 0.70,
    tags: ["think-tank", "policy", "center-left"],
  },
  {
    domain: "rand.org",
    name: "RAND Corporation",
    url: "https://www.rand.org",
    description: "Research organization that develops solutions to public policy challenges",
    sourceType: "think_tank",
    incentiveType: "nonprofit",
    domains: ["policy", "security", "health", "education"],
    factualAccuracy: 0.88,
    methodologicalRigor: 0.90,
    transparencyScore: 0.82,
    independenceScore: 0.72,
    ideologicalTransparency: 0.70,
    fundingTransparency: 0.75,
    conflictDisclosure: 0.78,
    perspectiveDiversity: 0.72,
    geographicNeutrality: 0.60,
    temporalNeutrality: 0.80,
    selectionBiasResistance: 0.82,
    quantificationBias: 0.78,
    tags: ["think-tank", "policy", "defense"],
  },
  {
    domain: "povertyactionlab.org",
    name: "J-PAL",
    url: "https://www.povertyactionlab.org",
    description: "Abdul Latif Jameel Poverty Action Lab - RCT evidence for poverty alleviation",
    sourceType: "research",
    incentiveType: "academic",
    domains: ["development", "poverty", "economics", "policy"],
    factualAccuracy: 0.94,
    methodologicalRigor: 0.96, // RCT gold standard
    transparencyScore: 0.92,
    independenceScore: 0.85,
    ideologicalTransparency: 0.85,
    fundingTransparency: 0.88,
    conflictDisclosure: 0.90,
    perspectiveDiversity: 0.80,
    geographicNeutrality: 0.85,
    temporalNeutrality: 0.80,
    selectionBiasResistance: 0.92,
    quantificationBias: 0.85,
    tags: ["rct", "evidence-based", "development"],
  },

  // ============================================================================
  // Phase 3: Fact-Checkers
  // ============================================================================
  {
    domain: "snopes.com",
    name: "Snopes",
    url: "https://www.snopes.com",
    description: "Oldest and largest fact-checking website covering urban legends, folklore, and misinformation",
    sourceType: "other",
    incentiveType: "independent",
    domains: ["misinformation", "politics", "health", "science"],
    factualAccuracy: 0.90,
    methodologicalRigor: 0.85,
    transparencyScore: 0.88,
    independenceScore: 0.82,
    ideologicalTransparency: 0.78,
    fundingTransparency: 0.75,
    conflictDisclosure: 0.80,
    perspectiveDiversity: 0.75,
    geographicNeutrality: 0.65,
    temporalNeutrality: 0.70,
    selectionBiasResistance: 0.80,
    quantificationBias: 0.70,
    tags: ["fact-check", "IFCN-certified", "misinformation"],
  },
  {
    domain: "politifact.com",
    name: "PolitiFact",
    url: "https://www.politifact.com",
    description: "Pulitzer Prize-winning fact-checking website focusing on political claims",
    sourceType: "other",
    incentiveType: "nonprofit",
    domains: ["politics", "policy", "elections"],
    factualAccuracy: 0.88,
    methodologicalRigor: 0.85,
    transparencyScore: 0.90,
    independenceScore: 0.78,
    ideologicalTransparency: 0.80,
    fundingTransparency: 0.85,
    conflictDisclosure: 0.82,
    perspectiveDiversity: 0.72,
    geographicNeutrality: 0.55, // US-focused
    temporalNeutrality: 0.65,
    selectionBiasResistance: 0.75,
    quantificationBias: 0.68,
    tags: ["fact-check", "IFCN-certified", "politics"],
  },
  {
    domain: "fullfact.org",
    name: "Full Fact",
    url: "https://fullfact.org",
    description: "UK's independent fact-checking charity",
    sourceType: "other",
    incentiveType: "nonprofit",
    domains: ["politics", "health", "economics", "policy"],
    factualAccuracy: 0.90,
    methodologicalRigor: 0.88,
    transparencyScore: 0.92,
    independenceScore: 0.85,
    ideologicalTransparency: 0.88,
    fundingTransparency: 0.90,
    conflictDisclosure: 0.88,
    perspectiveDiversity: 0.75,
    geographicNeutrality: 0.60, // UK-focused
    temporalNeutrality: 0.70,
    selectionBiasResistance: 0.82,
    quantificationBias: 0.72,
    tags: ["fact-check", "IFCN-certified", "UK"],
  },

  // ============================================================================
  // Phase 5: Government Data Portals
  // ============================================================================
  {
    domain: "data.gov",
    name: "data.gov",
    url: "https://data.gov",
    description: "US Federal Government's open data portal",
    sourceType: "government",
    incentiveType: "government",
    domains: ["economics", "health", "environment", "transportation", "education"],
    factualAccuracy: 0.94,
    methodologicalRigor: 0.88,
    transparencyScore: 0.92,
    independenceScore: 0.65, // Government
    ideologicalTransparency: 0.60,
    fundingTransparency: 0.90,
    conflictDisclosure: 0.70,
    perspectiveDiversity: 0.60,
    geographicNeutrality: 0.40, // US only
    temporalNeutrality: 0.85,
    selectionBiasResistance: 0.75,
    quantificationBias: 0.70,
    tags: ["official-statistics", "open-data", "US-federal"],
  },
  {
    domain: "ec.europa.eu/eurostat",
    name: "Eurostat",
    url: "https://ec.europa.eu/eurostat",
    description: "Statistical office of the European Union",
    sourceType: "government",
    incentiveType: "government",
    domains: ["economics", "demographics", "environment", "trade"],
    factualAccuracy: 0.95,
    methodologicalRigor: 0.92,
    transparencyScore: 0.90,
    independenceScore: 0.70,
    ideologicalTransparency: 0.65,
    fundingTransparency: 0.88,
    conflictDisclosure: 0.72,
    perspectiveDiversity: 0.65,
    geographicNeutrality: 0.50, // EU only
    temporalNeutrality: 0.88,
    selectionBiasResistance: 0.82,
    quantificationBias: 0.75,
    tags: ["official-statistics", "open-data", "EU"],
  },
  {
    domain: "data.un.org",
    name: "UN Data",
    url: "https://data.un.org",
    description: "United Nations statistical databases covering a wide range of themes",
    sourceType: "government",
    incentiveType: "government",
    domains: ["demographics", "economics", "environment", "health", "education"],
    factualAccuracy: 0.93,
    methodologicalRigor: 0.88,
    transparencyScore: 0.85,
    independenceScore: 0.68,
    ideologicalTransparency: 0.62,
    fundingTransparency: 0.82,
    conflictDisclosure: 0.68,
    perspectiveDiversity: 0.75,
    geographicNeutrality: 0.90, // Global
    temporalNeutrality: 0.82,
    selectionBiasResistance: 0.78,
    quantificationBias: 0.72,
    tags: ["official-statistics", "open-data", "global"],
  },
];

async function seedSources() {
  const db = getDatabase();

  console.log(`Seeding ${SOURCES.length} sources...`);

  for (const source of SOURCES) {
    const debiasedScore = calculateDebiasedScore({
      independenceScore: source.independenceScore,
      ideologicalTransparency: source.ideologicalTransparency,
      fundingTransparency: source.fundingTransparency,
      conflictDisclosure: source.conflictDisclosure,
      perspectiveDiversity: source.perspectiveDiversity,
      geographicNeutrality: source.geographicNeutrality,
      temporalNeutrality: source.temporalNeutrality,
      selectionBiasResistance: source.selectionBiasResistance,
      quantificationBias: source.quantificationBias,
    });

    const overallCredibility = calculateOverallCredibility({
      factualAccuracy: source.factualAccuracy,
      methodologicalRigor: source.methodologicalRigor,
      transparencyScore: source.transparencyScore,
      debiasedScore,
    });

    try {
      await db
        .insert(managedSources)
        .values({
          id: generateId("src"),
          domain: source.domain,
          name: source.name,
          url: source.url,
          description: source.description,
          sourceType: source.sourceType,
          incentiveType: source.incentiveType,
          domains: source.domains,
          factualAccuracy: source.factualAccuracy,
          methodologicalRigor: source.methodologicalRigor,
          transparencyScore: source.transparencyScore,
          independenceScore: source.independenceScore,
          ideologicalTransparency: source.ideologicalTransparency,
          fundingTransparency: source.fundingTransparency,
          conflictDisclosure: source.conflictDisclosure,
          perspectiveDiversity: source.perspectiveDiversity,
          geographicNeutrality: source.geographicNeutrality,
          temporalNeutrality: source.temporalNeutrality,
          selectionBiasResistance: source.selectionBiasResistance,
          quantificationBias: source.quantificationBias,
          debiasedScore,
          overallCredibility,
          tags: source.tags,
          status: "active",
        })
        .onConflictDoUpdate({
          target: managedSources.domain,
          set: {
            name: source.name,
            url: source.url,
            description: source.description,
            sourceType: source.sourceType,
            incentiveType: source.incentiveType,
            domains: source.domains,
            factualAccuracy: source.factualAccuracy,
            methodologicalRigor: source.methodologicalRigor,
            transparencyScore: source.transparencyScore,
            independenceScore: source.independenceScore,
            ideologicalTransparency: source.ideologicalTransparency,
            fundingTransparency: source.fundingTransparency,
            conflictDisclosure: source.conflictDisclosure,
            perspectiveDiversity: source.perspectiveDiversity,
            geographicNeutrality: source.geographicNeutrality,
            temporalNeutrality: source.temporalNeutrality,
            selectionBiasResistance: source.selectionBiasResistance,
            quantificationBias: source.quantificationBias,
            debiasedScore,
            overallCredibility,
            tags: source.tags,
            updatedAt: new Date(),
          },
        });

      console.log(`  ✓ ${source.name} (credibility: ${overallCredibility.toFixed(2)})`);
    } catch (error) {
      console.error(`  ✗ Failed to seed ${source.name}:`, error);
    }
  }

  console.log("\nDone!");
  process.exit(0);
}

// Run if called directly
seedSources().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});

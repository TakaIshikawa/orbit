-- Information Units Schema
-- Decomposes source content into atomic, comparable units at defined granularity levels

-- Granularity levels from most abstract (0) to most concrete (6)
DO $$ BEGIN
  CREATE TYPE granularity_level AS ENUM (
    'paradigm',      -- L0: Worldviews, fundamental assumptions
    'theory',        -- L1: Causal models, frameworks
    'mechanism',     -- L2: How things work, pathways
    'causal_claim',  -- L3: If-then predictions
    'statistical',   -- L4: Correlations, distributions
    'observation',   -- L5: Measured values, events
    'data_point'     -- L6: Raw data with source
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Temporal scope
DO $$ BEGIN
  CREATE TYPE temporal_scope AS ENUM (
    'timeless',      -- Universal laws, definitions
    'era',           -- Decades to centuries
    'period',        -- Years to decades
    'recent',        -- Months to years
    'current',       -- Days to months
    'point'          -- Specific moment
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Spatial scope
DO $$ BEGIN
  CREATE TYPE spatial_scope AS ENUM (
    'universal',     -- Applies everywhere
    'global',        -- Worldwide
    'regional',      -- Continent/region
    'national',      -- Single country
    'local',         -- City/area
    'specific'       -- Specific location/entity
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Measurability
DO $$ BEGIN
  CREATE TYPE measurability AS ENUM (
    'quantitative',      -- Numeric, precise
    'semi_quantitative', -- Ranges, ordinal scales
    'qualitative',       -- Descriptive, categorical
    'conceptual'         -- Abstract, definitional
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Information units extracted from sources
CREATE TABLE IF NOT EXISTS information_units (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Source attribution
  source_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  item_url TEXT NOT NULL,
  item_title TEXT NOT NULL,
  excerpt TEXT NOT NULL,

  -- Granularity classification
  granularity_level granularity_level NOT NULL,
  granularity_confidence REAL NOT NULL DEFAULT 0.8,

  -- The information unit itself
  statement TEXT NOT NULL,
  statement_hash TEXT NOT NULL,

  -- Scope dimensions
  temporal_scope temporal_scope NOT NULL,
  temporal_specifics JSONB,
  spatial_scope spatial_scope NOT NULL,
  spatial_specifics JSONB,

  -- Domain/topic
  domains JSONB NOT NULL DEFAULT '[]',
  concepts JSONB NOT NULL DEFAULT '[]',

  -- Measurability
  measurability measurability NOT NULL,
  quantitative_data JSONB,

  -- Epistemological properties
  falsifiability_score REAL NOT NULL,
  falsifiability_criteria JSONB,

  -- For Bayesian updates
  prior_confidence REAL NOT NULL DEFAULT 0.5,
  current_confidence REAL NOT NULL DEFAULT 0.5,
  update_count INTEGER NOT NULL DEFAULT 0,

  -- Source credibility at this granularity level
  source_authority_for_level REAL NOT NULL,

  -- Links
  issue_id TEXT REFERENCES issues(id),
  parent_unit_id TEXT,
  derived_from_units JSONB DEFAULT '[]'
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_info_units_granularity ON information_units(granularity_level);
CREATE INDEX IF NOT EXISTS idx_info_units_issue ON information_units(issue_id);
CREATE INDEX IF NOT EXISTS idx_info_units_statement_hash ON information_units(statement_hash);
CREATE INDEX IF NOT EXISTS idx_info_units_source ON information_units(source_id);

-- Cross-validation comparisons between units at the same granularity
CREATE TABLE IF NOT EXISTS unit_comparisons (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- The two units being compared
  unit_a_id TEXT NOT NULL REFERENCES information_units(id),
  unit_b_id TEXT NOT NULL REFERENCES information_units(id),
  granularity_level granularity_level NOT NULL,

  -- Comparability assessment
  comparability_score REAL NOT NULL,
  comparability_factors JSONB,

  -- Comparison result
  relationship TEXT NOT NULL, -- agrees, contradicts, refines, unrelated
  agreement_score REAL NOT NULL, -- -1 to +1

  -- For contradictions
  contradiction_type TEXT, -- factual, methodological, interpretive, scope
  contradiction_analysis JSONB,

  -- Confidence impact
  net_confidence_impact REAL NOT NULL,
  impact_explanation TEXT
);

CREATE INDEX IF NOT EXISTS idx_unit_comparisons_unit_a ON unit_comparisons(unit_a_id);
CREATE INDEX IF NOT EXISTS idx_unit_comparisons_unit_b ON unit_comparisons(unit_b_id);
CREATE INDEX IF NOT EXISTS idx_unit_comparisons_relationship ON unit_comparisons(relationship);

-- Aggregated consistency scores
CREATE TABLE IF NOT EXISTS claim_consistency (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- The claim being assessed
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,

  -- Units supporting this claim by level
  support_by_level JSONB,

  -- Overall consistency metrics
  overall_consistency REAL NOT NULL,
  weighted_consistency REAL NOT NULL,

  -- Strongest support and challenges
  strongest_support JSONB,
  strongest_challenges JSONB,

  -- Recommended update
  recommended_confidence_update REAL,
  update_rationale TEXT
);

CREATE INDEX IF NOT EXISTS idx_claim_consistency_entity ON claim_consistency(entity_type, entity_id);

-- Knowledge Base Indexes for Cross-Issue Unit Comparisons
-- Enables efficient querying of historical units by domain, concepts, and falsifiability

-- Index for querying by falsifiability score (high-falsifiability units are most reusable)
CREATE INDEX IF NOT EXISTS idx_information_units_falsifiability
ON information_units (falsifiability_score DESC)
WHERE falsifiability_score >= 0.7;

-- GIN index for domain array containment queries
CREATE INDEX IF NOT EXISTS idx_information_units_domains
ON information_units USING GIN (domains);

-- GIN index for concept array containment queries
CREATE INDEX IF NOT EXISTS idx_information_units_concepts
ON information_units USING GIN (concepts);

-- Composite index for knowledge base queries (falsifiability + created_at for recency)
CREATE INDEX IF NOT EXISTS idx_information_units_knowledge_base
ON information_units (falsifiability_score DESC, created_at DESC)
WHERE falsifiability_score >= 0.6;

-- Index for temporal scope queries
CREATE INDEX IF NOT EXISTS idx_information_units_temporal
ON information_units (temporal_scope, created_at DESC);

-- Index for granularity level queries
CREATE INDEX IF NOT EXISTS idx_information_units_granularity
ON information_units (granularity_level, falsifiability_score DESC);

-- Add column to track if unit has been used in cross-issue comparisons
ALTER TABLE information_units
ADD COLUMN IF NOT EXISTS cross_issue_comparison_count integer DEFAULT 0;

-- Add column to track knowledge base validation status
ALTER TABLE information_units
ADD COLUMN IF NOT EXISTS kb_validated boolean DEFAULT false;

-- Add column to store the last time this unit was used for cross-validation
ALTER TABLE information_units
ADD COLUMN IF NOT EXISTS last_used_for_validation timestamp with time zone;

-- Create table for cross-issue comparisons (separate from within-issue comparisons)
CREATE TABLE IF NOT EXISTS cross_issue_comparisons (
  id text PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),

  -- The new unit being validated
  new_unit_id text NOT NULL REFERENCES information_units(id) ON DELETE CASCADE,
  new_unit_issue_id text NOT NULL,

  -- The historical unit used as evidence
  historical_unit_id text NOT NULL REFERENCES information_units(id) ON DELETE CASCADE,
  historical_unit_issue_id text NOT NULL,

  -- Comparison results
  relationship text NOT NULL, -- 'supports', 'contradicts', 'refines', 'unrelated'
  similarity_score real NOT NULL, -- 0-1, how similar the claims are
  relevance_score real NOT NULL, -- 0-1, how relevant for validation

  -- Domain/concept overlap
  domain_overlap jsonb DEFAULT '[]',
  concept_overlap jsonb DEFAULT '[]',

  -- Confidence impact
  confidence_impact real NOT NULL, -- How much this comparison affects confidence
  impact_explanation text,

  -- Falsifiability weighting
  historical_unit_falsifiability real NOT NULL,
  falsifiability_weight real NOT NULL, -- Higher falsifiability = more weight

  -- Temporal considerations
  temporal_relevance text, -- 'current', 'outdated', 'historical'
  temporal_note text
);

-- Indexes for cross-issue comparisons
CREATE INDEX IF NOT EXISTS idx_cross_issue_comparisons_new_unit
ON cross_issue_comparisons (new_unit_id);

CREATE INDEX IF NOT EXISTS idx_cross_issue_comparisons_historical_unit
ON cross_issue_comparisons (historical_unit_id);

CREATE INDEX IF NOT EXISTS idx_cross_issue_comparisons_relationship
ON cross_issue_comparisons (relationship, confidence_impact DESC);

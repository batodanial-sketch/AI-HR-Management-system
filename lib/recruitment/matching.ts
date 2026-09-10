/**
 * Deterministic candidate↔job matching — pure functions, no I/O, no models.
 *
 * Produces an explainable match (score, coverage, missing requirements,
 * evidence, confidence, limitations) plus an ADVISORY recommendation:
 *
 *   ADVANCE | HOLD | REJECT_REVIEW
 *
 * The system never makes employment decisions: even the lowest score yields
 * REJECT_REVIEW (human reviews), and candidates with no usable signals yield
 * HOLD ("gather more information") — never an automated rejection.
 *
 * Fairness by construction: the input types expose ONLY non-sensitive
 * professional fields (skills, experience, location, summary, tags). Email,
 * phone, age, gender, ethnicity, photos, names, and any other protected or
 * identifying attributes cannot be passed to the matcher — there is no
 * parameter for them, so no rule can use them. A regression test pins this
 * (extra fields on the input object do not change the output).
 *
 * Score weights (documented, fixed): skills 45% · requirements 30% ·
 * experience 15% · location 10%.
 */

export interface CandidateProfile {
  skills: string[];
  experienceYears: number | null;
  location: string | null;
  /** Free text used ONLY for skill-phrase evidence; never for inference. */
  summary: string | null;
  tags: string[];
}

export interface JobProfile {
  title: string;
  description: string;
  /** Explicit requirements; when empty the caller extracts them from the description. */
  requirements: string[];
  skills: string[];
  location: string | null;
  employmentType: string | null;
  minExperienceYears: number | null;
}

export type MatchRecommendation = "ADVANCE" | "HOLD" | "REJECT_REVIEW";

export interface ExperienceMatch {
  status: "meets" | "below" | "unknown" | "not-required";
  detail: string;
}

export interface LocationCompatibility {
  status: "compatible" | "remote-ok" | "different" | "unknown";
  detail: string;
}

export interface CandidateMatch {
  /** 0–100 weighted composite. */
  score: number;
  /** 0–1; penalized for every missing signal (see penalties below). */
  confidence: number;
  recommendation: MatchRecommendation;
  skillsMatched: string[];
  skillsCoverage: number;
  requirementsCovered: string[];
  missingRequirements: string[];
  requirementsCoverage: number;
  experience: ExperienceMatch;
  location: LocationCompatibility;
  evidence: string[];
  explanation: string[];
  limitations: string[];
  insufficientData: boolean;
}

/* ── normalization ─────────────────────────────────────────────────── */

function normalizePhrase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/[^a-z0-9+#./\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Skill alias groups — canonical name first. Kept small and explicit; every
 * entry is a genuine synonym, not a guess (no "java ≈ javascript").
 */
const SKILL_ALIASES: string[][] = [
  ["javascript", "js", "ecmascript"],
  ["typescript", "ts"],
  ["react", "react.js", "reactjs"],
  ["node.js", "nodejs", "node"],
  ["python", "python3"],
  ["postgresql", "postgres", "psql"],
  ["mongodb", "mongo"],
  ["amazon web services", "aws"],
  ["google cloud", "gcp", "google cloud platform"],
  ["microsoft azure", "azure"],
  ["machine learning", "ml"],
  ["natural language processing", "nlp"],
  ["user interface design", "ui design"],
  ["user experience design", "ux design"],
  ["continuous integration", "ci"],
  ["continuous delivery", "cd"],
  ["ci/cd", "cicd"],
  ["rest api", "restful api", "rest"],
  ["graphql", "graph ql"],
  ["docker", "containerization"],
  ["kubernetes", "k8s"],
];

const ALIAS_TO_CANONICAL = new Map<string, string>();
for (const group of SKILL_ALIASES) {
  for (const alias of group) ALIAS_TO_CANONICAL.set(alias, group[0]);
}

function canonicalSkill(value: string): string {
  const normalized = normalizePhrase(value);
  return ALIAS_TO_CANONICAL.get(normalized) ?? normalized;
}

/* ── JD requirement extraction ─────────────────────────────────────── */

const BULLET_RE = /^\s*(?:[•▪▸\-*–—]|\d{1,2}[.)])\s+/;

/**
 * Structural requirement extraction from a job description: ONLY lines with
 * an explicit bullet or numbered marker, de-duplicated, capped. Plain prose
 * lines are ignored — treating marketing copy as requirements would pollute
 * the missing-requirements list. Extracts structure only; never invents
 * requirements the text does not state.
 */
export function extractRequirements(description: string, limit = 30): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const rawLine of description.split(/\r?\n/)) {
    if (!BULLET_RE.test(rawLine)) continue;
    const line = rawLine.replace(BULLET_RE, "").trim().replace(/\s+/g, " ");
    if (line.length < 4 || line.length > 300) continue;
    if (line.split(" ").length < 2) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
    if (out.length >= limit) break;
  }
  return out;
}

/* ── matching ──────────────────────────────────────────────────────── */

function requirementCovered(requirement: string, candidateSkills: Set<string>): boolean {
  const normalized = normalizePhrase(requirement);
  if (normalized.length === 0) return false;
  for (const skill of candidateSkills) {
    if (skill.length >= 3 && normalized.includes(skill)) return true;
  }
  // Also match when the requirement itself names exactly one skill.
  return candidateSkills.has(canonicalSkill(requirement));
}

export function matchCandidate(candidate: CandidateProfile, job: JobProfile): CandidateMatch {
  const evidence: string[] = [];
  const explanation: string[] = [];
  const limitations: string[] = [];

  const candidateSkills = new Set<string>();
  for (const s of [...candidate.skills, ...candidate.tags]) {
    const c = canonicalSkill(s);
    if (c) candidateSkills.add(c);
  }
  // Skill phrases evidenced by the summary text (evidence-grade only).
  const summaryNorm = candidate.summary ? normalizePhrase(candidate.summary) : "";
  const summaryHits: string[] = [];
  for (const skill of [...candidateSkills]) {
    if (skill.length >= 4 && summaryNorm.includes(skill)) summaryHits.push(skill);
  }

  const candidateSignalCount =
    candidateSkills.size +
    (candidate.experienceYears !== null ? 1 : 0) +
    (candidate.location ? 1 : 0) +
    (candidate.summary ? 1 : 0);
  const insufficientData = candidateSignalCount === 0;

  // Skills component (45%).
  const jobSkills = [...new Set(job.skills.map(canonicalSkill).filter(Boolean))];
  const skillsMatched = jobSkills.filter((s) => candidateSkills.has(s));
  const skillsCoverage = jobSkills.length > 0 ? skillsMatched.length / jobSkills.length : 0;
  if (jobSkills.length === 0) limitations.push("job lists no skills — skills component scored 0");
  else {
    evidence.push(`skills_matched = ${skillsMatched.length}/${jobSkills.length} (${skillsMatched.join(", ") || "none"})`);
    explanation.push(
      skillsMatched.length > 0
        ? `Candidate covers ${skillsMatched.length} of ${jobSkills.length} listed skills (${skillsMatched.slice(0, 6).join(", ")}${skillsMatched.length > 6 ? "…" : ""}).`
        : "Candidate covers none of the listed skills.",
    );
  }
  if (summaryHits.length > 0) evidence.push(`summary_corroborates = ${summaryHits.slice(0, 6).join(", ")}`);

  // Requirements component (30%).
  const requirements = job.requirements.length > 0 ? job.requirements : extractRequirements(job.description);
  const requirementsSource = job.requirements.length > 0 ? "explicit" : "extracted-from-description";
  const requirementsCovered = requirements.filter((r) => requirementCovered(r, candidateSkills));
  const missingRequirements = requirements.filter((r) => !requirementCovered(r, candidateSkills));
  const requirementsCoverage = requirements.length > 0 ? requirementsCovered.length / requirements.length : 0;
  if (requirements.length === 0) limitations.push("job states no requirements — requirements component scored 0");
  else {
    evidence.push(`requirements_covered = ${requirementsCovered.length}/${requirements.length} (${requirementsSource})`);
    explanation.push(
      missingRequirements.length === 0
        ? "All stated requirements are covered by the candidate's skills."
        : `Missing requirements (${missingRequirements.length}): ${missingRequirements.slice(0, 5).join(" ‖ ")}${missingRequirements.length > 5 ? " …" : ""}`,
    );
  }

  // Experience component (15%).
  let experienceScore: number;
  let experience: ExperienceMatch;
  if (job.minExperienceYears === null || job.minExperienceYears === undefined) {
    experienceScore = 1;
    experience = { status: "not-required", detail: "Job states no minimum experience — experience is neutral." };
  } else if (candidate.experienceYears === null || candidate.experienceYears === undefined) {
    experienceScore = 0.4;
    experience = { status: "unknown", detail: `Job asks ${job.minExperienceYears}+ years; candidate experience is unknown.` };
    limitations.push("candidate experience unknown — verify from resume or screening call");
  } else if (candidate.experienceYears >= job.minExperienceYears) {
    experienceScore = 1;
    experience = { status: "meets", detail: `Candidate has ${candidate.experienceYears} years; job asks ${job.minExperienceYears}+.` };
  } else {
    experienceScore = Math.max(0, candidate.experienceYears / job.minExperienceYears);
    experience = { status: "below", detail: `Candidate has ${candidate.experienceYears} years; job asks ${job.minExperienceYears}+.` };
  }
  evidence.push(`experience = ${experience.status} (${experience.detail})`);

  // Location component (10%).
  const jobLoc = (job.location ?? "").toLowerCase();
  const candLoc = (candidate.location ?? "").toLowerCase();
  const remoteOk = /remote|anywhere|distributed/.test(`${jobLoc} ${(job.employmentType ?? "").toLowerCase()}`);
  let locationScore: number;
  let location: LocationCompatibility;
  if (remoteOk) {
    locationScore = 1;
    location = { status: "remote-ok", detail: "Role is remote — location is not a constraint." };
  } else if (!jobLoc || !candLoc) {
    locationScore = 0.5;
    location = { status: "unknown", detail: "Location compatibility unknown — one side did not state a location." };
    limitations.push("location unknown on at least one side — confirm work location expectations");
  } else {
    const jobTokens = new Set(jobLoc.split(/[,/;|]/).map((t) => t.trim()).filter(Boolean));
    const candTokens = candLoc.split(/[,/;|]/).map((t) => t.trim()).filter(Boolean);
    const overlap = candTokens.filter((t) => jobTokens.has(t) || [...jobTokens].some((j) => j.includes(t) || t.includes(j)));
    if (overlap.length > 0) {
      locationScore = 1;
      location = { status: "compatible", detail: `Locations overlap on "${overlap[0]}".` };
    } else {
      locationScore = 0.3;
      location = { status: "different", detail: `Candidate is in "${candidate.location}"; role is in "${job.location}" — confirm relocation or remote flexibility.` };
      limitations.push("locations differ — confirm relocation willingness or remote flexibility before advancing");
    }
  }
  evidence.push(`location = ${location.status} (${location.detail})`);

  const score = Math.round(
    100 * (0.45 * skillsCoverage + 0.3 * requirementsCoverage + 0.15 * experienceScore + 0.1 * locationScore),
  );

  // Confidence: base 0.85 with a documented penalty per missing signal.
  let confidence = 0.85;
  if (candidateSkills.size === 0) confidence -= 0.2;
  if (requirements.length === 0) confidence -= 0.15;
  if (candidate.experienceYears === null || candidate.experienceYears === undefined) confidence -= 0.1;
  if (!candidate.location || !job.location) confidence -= 0.05;
  confidence = Math.max(0.3, Math.round(confidence * 100) / 100);

  let recommendation: MatchRecommendation;
  if (insufficientData) {
    recommendation = "HOLD";
    explanation.unshift("No usable candidate signals — gather skills, experience, or location before any decision. The system never rejects on missing data.");
  } else if (requirements.length === 0 && jobSkills.length === 0) {
    recommendation = "HOLD";
    explanation.unshift("Job states no skills or requirements — matching against an empty profile is capped at HOLD.");
  } else if (score >= 75 && confidence >= 0.5) {
    recommendation = "ADVANCE";
    explanation.unshift(`Strong profile match (score ${score}, confidence ${confidence}) — recommend advancing to human review.`);
  } else if (score >= 50) {
    recommendation = "HOLD";
    explanation.unshift(`Partial match (score ${score}) — hold for comparison or request missing information.`);
  } else {
    recommendation = "REJECT_REVIEW";
    explanation.unshift(`Weak match (score ${score}) — a human should review; this is advisory, not a decision.`);
  }

  return {
    score,
    confidence,
    recommendation,
    skillsMatched,
    skillsCoverage: Math.round(skillsCoverage * 100) / 100,
    requirementsCovered,
    missingRequirements,
    requirementsCoverage: Math.round(requirementsCoverage * 100) / 100,
    experience,
    location,
    evidence,
    explanation,
    limitations,
    insufficientData,
  };
}

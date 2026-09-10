/**
 * Recruitment matching — deterministic, explainable, fair.
 *
 * Pins: coverage math, alias handling, missing-requirement detection, score
 * weights, confidence penalties, recommendation bands, the never-reject-on-
 * missing-data rule, and fairness-by-construction (sensitive/extra fields
 * cannot influence the output).
 */
import {
  extractRequirements,
  matchCandidate,
  type CandidateProfile,
  type JobProfile,
} from "@/lib/recruitment/matching";

const JOB: JobProfile = {
  title: "Backend Engineer",
  description: "Build APIs.\n• 3+ years with Python\n• PostgreSQL experience\n• REST API design",
  requirements: ["3+ years with Python", "PostgreSQL experience", "REST API design"],
  skills: ["Python", "PostgreSQL", "REST API"],
  location: "Karachi, PK",
  employmentType: "full_time",
  minExperienceYears: 3,
};

const STRONG: CandidateProfile = {
  skills: ["Python", "PostgreSQL", "REST API", "Docker"],
  experienceYears: 5,
  location: "Karachi, PK",
  summary: "Backend engineer with 5 years of Python and PostgreSQL experience building REST APIs.",
  tags: ["backend"],
};

describe("extractRequirements", () => {
  it("extracts structural bullets without inventing requirements", () => {
    const reqs = extractRequirements("Join us.\n• 3+ years with Python\n• PostgreSQL experience\n1. REST API design\n\nApply now today please.");
    expect(reqs).toEqual(["3+ years with Python", "PostgreSQL experience", "REST API design"]);
  });
  it("returns [] for prose without structure", () => {
    expect(extractRequirements("Great role, apply soon.")).toEqual([]);
  });
});

describe("matchCandidate", () => {
  it("scores a strong match with ADVANCE + full evidence", () => {
    const m = matchCandidate(STRONG, JOB);
    expect(m.score).toBeGreaterThanOrEqual(75);
    expect(m.recommendation).toBe("ADVANCE");
    expect(m.skillsCoverage).toBe(1);
    expect(m.requirementsCoverage).toBe(1);
    expect(m.missingRequirements).toHaveLength(0);
    expect(m.experience.status).toBe("meets");
    expect(m.location.status).toBe("compatible");
    expect(m.evidence.length).toBeGreaterThanOrEqual(4);
    expect(m.insufficientData).toBe(false);
  });
  it("resolves skill aliases (js → javascript)", () => {
    const m = matchCandidate(
      { ...STRONG, skills: ["js"], tags: [] },
      { ...JOB, skills: ["JavaScript"], requirements: ["JavaScript"], description: "" },
    );
    expect(m.skillsMatched).toContain("javascript");
    expect(m.skillsCoverage).toBe(1);
  });
  it("detects missing requirements and holds partial matches", () => {
    const m = matchCandidate(
      { ...STRONG, skills: ["Python"], tags: [], summary: null },
      JOB,
    );
    expect(m.missingRequirements.length).toBeGreaterThan(0);
    expect(m.missingRequirements.join(" ")).toContain("PostgreSQL");
    expect(m.recommendation).toBe("HOLD");
    expect(m.explanation.join(" ")).toContain("Missing requirements");
  });
  it("yields REJECT_REVIEW (advisory) for weak matches, never an auto-decision", () => {
    const m = matchCandidate(
      { skills: ["Excel"], experienceYears: 1, location: "Lahore, PK", summary: null, tags: [] },
      JOB,
    );
    expect(m.score).toBeLessThan(50);
    expect(m.recommendation).toBe("REJECT_REVIEW");
    expect(m.explanation.join(" ")).toMatch(/advisory|human/i);
  });
  it("HOLDS on insufficient data instead of rejecting", () => {
    const m = matchCandidate({ skills: [], experienceYears: null, location: null, summary: null, tags: [] }, JOB);
    expect(m.insufficientData).toBe(true);
    expect(m.recommendation).toBe("HOLD");
    expect(m.explanation.join(" ")).toMatch(/never rejects on missing data/i);
  });
  it("caps at HOLD when the job states no skills or requirements", () => {
    const m = matchCandidate(STRONG, { ...JOB, skills: [], requirements: [], description: "Great role, apply soon." });
    expect(m.recommendation).toBe("HOLD");
    expect(m.limitations.length).toBeGreaterThan(0);
  });
  it("treats remote roles as location-neutral", () => {
    const m = matchCandidate(STRONG, { ...JOB, location: "Berlin, DE", employmentType: "remote" });
    expect(m.location.status).toBe("remote-ok");
  });
  it("penalizes confidence per missing signal with a 0.3 floor", () => {
    const full = matchCandidate(STRONG, JOB).confidence;
    const thin = matchCandidate({ skills: ["Python"], experienceYears: null, location: null, summary: null, tags: [] }, JOB).confidence;
    expect(thin).toBeLessThan(full);
    expect(thin).toBeGreaterThanOrEqual(0.3);
  });
  it("FAIRNESS: sensitive/extra fields cannot change the output", () => {
    const baseline = matchCandidate(STRONG, JOB);
    const withExtras = matchCandidate(
      { ...STRONG, email: "a@b.c", phone: "+1", age: 22, gender: "x", photo: "url", name: "Zed" } as unknown as CandidateProfile,
      JOB,
    );
    expect(withExtras).toEqual(baseline);
  });
  it("below-minimum experience scales proportionally", () => {
    const m = matchCandidate({ ...STRONG, experienceYears: 1 }, JOB);
    expect(m.experience.status).toBe("below");
    expect(m.score).toBeLessThan(matchCandidate(STRONG, JOB).score);
  });
});

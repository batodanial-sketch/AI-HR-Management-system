import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CandidateForm } from "@/components/recruitment/candidate-form";

export const metadata: Metadata = {
  title: "Add Candidate",
};

export default function NewCandidatePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Add candidate</h1>
        <p className="text-sm text-muted-foreground">
          Create a candidate, or upload a resume and let AI fill the profile.
        </p>
      </div>
      <Card className="glass">
        <CardHeader>
          <CardTitle>Candidate details</CardTitle>
          <CardDescription>
            AI parsing extracts name, role, skills and experience from a resume.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CandidateForm />
        </CardContent>
      </Card>
    </div>
  );
}

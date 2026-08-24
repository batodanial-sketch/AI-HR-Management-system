import type { Metadata } from "next";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { getCandidates } from "@/lib/api";
import { KanbanBoard } from "@/components/recruitment/kanban-board";
import { RankCandidatesButton } from "@/components/recruitment/rank-candidates";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Recruitment",
};

export default async function RecruitmentPage() {
  const candidates = await getCandidates();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recruitment"
        description="Track candidates through every stage of the hiring pipeline."
        actions={
          <>
            <RankCandidatesButton candidates={candidates} />
            <Button asChild data-testid="kanban-add-candidate">
              <Link href="/recruitment/new">
                <UserPlus className="h-4 w-4" /> Add candidate
              </Link>
            </Button>
          </>
        }
      />
      <KanbanBoard initialCandidates={candidates} />
    </div>
  );
}

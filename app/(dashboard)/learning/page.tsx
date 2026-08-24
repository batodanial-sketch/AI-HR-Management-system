import type { Metadata } from "next";
import { getLearningCourses } from "@/lib/domain";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import type { LearningCourse } from "@/lib/domain";

export const metadata: Metadata = { title: "Learning" };

export default async function LearningPage() {
  const courses = await getLearningCourses();

  const columns: DataColumn<LearningCourse>[] = [
    { key: "title", header: "Course", render: (r) => <span className="font-medium">{r.title}</span> },
    { key: "category", header: "Category", render: (r) => r.category },
    { key: "level", header: "Level", render: (r) => <Badge variant="secondary" className="capitalize">{r.level}</Badge> },
    { key: "duration", header: "Duration", align: "right", render: (r) => `${r.estimatedMinutes} min` },
    { key: "enrolled", header: "Enrolled", align: "right", render: (r) => r.enrolled },
    { key: "completion", header: "Completion", align: "right", render: (r) => `${r.completionRate}%` },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Learning & Compliance"
        description="Courses, certifications and mandatory training."
      />
      <DataTable rows={courses} columns={columns} testId="learning-courses-table" />
    </div>
  );
}

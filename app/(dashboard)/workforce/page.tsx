import type { Metadata } from "next";
import { getOrgChart } from "@/lib/domain";
import { PageHeader } from "@/components/layout/page-header";
import { NameAvatar } from "@/components/ui/avatar";
import type { OrgNode } from "@/lib/domain";

export const metadata: Metadata = { title: "Org Chart" };

export default async function WorkforcePage() {
  const nodes = await getOrgChart();
  const roots = nodes.filter((n) => !n.managerId);
  const childrenOf = (managerId: string) => nodes.filter((n) => n.managerId === managerId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organisation Chart"
        description="Reporting lines across your organisation."
      />
      <div className="space-y-6">
        {roots.map((root) => (
          <OrgBranch key={root.id} node={root} childrenOf={childrenOf} />
        ))}
      </div>
    </div>
  );
}

function OrgBranch({
  node,
  childrenOf,
}: {
  node: OrgNode;
  childrenOf: (id: string) => OrgNode[];
}) {
  const children = childrenOf(node.id);
  return (
    <div className="flex flex-col items-center gap-3">
      <OrgCard node={node} />
      {children.length > 0 && (
        <>
          <div className="h-4 w-px bg-border" />
          <div className="flex flex-wrap items-start justify-center gap-3">
            {children.map((child) => (
              <div key={child.id} className="flex flex-col items-center gap-3">
                <div className="h-4 w-px bg-border" />
                <OrgCard node={child} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function OrgCard({ node }: { node: OrgNode }) {
  return (
    <div className="glass flex items-center gap-3 rounded-xl px-4 py-3">
      <NameAvatar name={node.name} className="h-10 w-10" />
      <div>
        <p className="text-sm font-semibold">{node.name}</p>
        <p className="text-xs text-muted-foreground">{node.title}</p>
      </div>
    </div>
  );
}

import { createYoga } from "graphql-yoga";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { typeDefs, resolvers } from "@/lib/graphql/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = makeExecutableSchema({ typeDefs, resolvers });

const { handleRequest } = createYoga({
  schema,
  graphqlEndpoint: "/api/graphql",
  fetchAPI: { Response },
});

export async function GET(request: Request): Promise<Response> {
  return handleRequest(request, {});
}

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, {});
}

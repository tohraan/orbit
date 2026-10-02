import { DetailScreen } from "./DetailScreen";

/* The id is validated again in the route handler before it touches the index
 * (/api/opportunities/[id]); this page only passes it through. */
export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetailScreen id={id} />;
}

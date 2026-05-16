import GroupBuyDetailClient from "./GroupBuyDetailClient";

export default async function GroupBuyDetailPage(props) {
  const params = await props.params;
  return <GroupBuyDetailClient id={params.id} />;
}

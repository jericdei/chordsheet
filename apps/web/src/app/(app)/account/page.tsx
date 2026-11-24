import { AccountPage } from "@/components/AccountPage";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "Account & backup" };

export default async function Page() {
  const user = await getCurrentUser();
  return <AccountPage email={user?.email ?? ""} name={user?.name ?? null} />;
}

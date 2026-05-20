import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import AdminNav from "@/components/admin/AdminNav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  const authed = token ? await verifyToken(token) : false;

  if (!authed) {
    redirect("/auth/login");
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <AdminNav />
      <main className="flex-1 p-6 md:p-8 overflow-auto">{children}</main>
    </div>
  );
}

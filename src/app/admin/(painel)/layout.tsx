import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { platformLogoutAction } from "@/modules/platform/auth-actions";
import { getPlatformSession, isMfaComplete } from "@/lib/platform-auth";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await getPlatformSession();
  if (!session) redirect("/admin/login");
  if (!isMfaComplete(session)) redirect("/admin/2fa");

  const fresh =
    session.lastReauthAt !== null &&
    session.lastReauthAt.getTime() > Date.now() - 10 * 60 * 1000;

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem('admin-theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`,
        }}
      />
      <AdminShell email={session.email} role={session.role} fresh={fresh}>
        {children}
      </AdminShell>
    </>
  );
}

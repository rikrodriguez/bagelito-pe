import { LockKeyhole } from "lucide-react";
import { loginAdmin } from "../actions";

export default async function AdminLoginPage({ searchParams }: { searchParams?: Promise<{ error?: string }> }) {
  const params = await searchParams;

  return (
    <main className="admin-login-page">
      <form className="admin-login-card" action={loginAdmin}>
        <LockKeyhole size={34} />
        <p className="kicker">Private CRM</p>
        <h1>Bagelito admin</h1>
        <p>Enter the admin password to review reservations and batch production.</p>
        {params?.error === "missing-password" ? <div className="reserve-alert">ADMIN_PASSWORD is not configured.</div> : null}
        {params?.error === "invalid" ? <div className="reserve-alert">Invalid admin password.</div> : null}
        <label>Admin password<input type="password" name="password" required autoComplete="current-password" /></label>
        <button className="pill-button pink" type="submit">Open CRM</button>
      </form>
    </main>
  );
}

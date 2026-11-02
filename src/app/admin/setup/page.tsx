import { SetupForm } from "../components/auth-forms";
import styles from "../admin.module.css";

export default async function AccountSetupPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token || token.length > 128) {
    return <main className={styles.authPage}><section className={styles.panel}><p className={styles.error}>This setup link is invalid or expired.</p></section></main>;
  }
  return <SetupForm token={token} />;
}

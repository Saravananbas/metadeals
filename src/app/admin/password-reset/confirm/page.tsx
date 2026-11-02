import { PasswordResetConfirmForm } from "../../components/auth-forms";
import styles from "../../admin.module.css";

export default async function PasswordResetConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token || token.length > 128) {
    return <main className={styles.authPage}><section className={styles.panel}><p className={styles.error}>This reset link is invalid or expired.</p></section></main>;
  }
  return <PasswordResetConfirmForm token={token} />;
}

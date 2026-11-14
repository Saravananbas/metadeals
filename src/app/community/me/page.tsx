import { redirect } from "next/navigation";

/** My activity is a tab of the combined profile page. */
export default function MyActivityRedirect() { redirect("/account?tab=activity"); }

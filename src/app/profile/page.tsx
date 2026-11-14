import { redirect } from "next/navigation";

/** "Profile" in the navigation: the combined profile page (it shows the sign-in form to visitors). */
export default function ProfileRedirect() { redirect("/account"); }

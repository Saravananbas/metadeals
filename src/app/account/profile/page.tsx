import { redirect } from "next/navigation";

/** Editing now happens on the combined profile page. */
export default function EditProfileRedirect() { redirect("/account?edit=1"); }

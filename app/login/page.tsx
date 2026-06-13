import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Sign in · MowRoute",
};

export default async function LoginPage() {
  // Already signed in? Skip the form.
  const { user } = await getSessionProfile();
  if (user) redirect("/");

  return <LoginForm />;
}

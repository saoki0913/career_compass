import { redirect } from "next/navigation";

// Legacy route kept to avoid breaking old links. The product is now live.
export default function WaitlistRedirectPage() {
  redirect("/login");
}


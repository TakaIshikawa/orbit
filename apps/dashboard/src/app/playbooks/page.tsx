import { redirect } from "next/navigation";

// Redirect to home page - discovery is now unified on the home page
export default function PlaybooksPage() {
  redirect("/");
}

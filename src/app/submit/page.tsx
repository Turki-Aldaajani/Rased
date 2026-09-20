import { redirect } from "next/navigation";

/**
 * The old multi-field submission form. There is only one way to add a find
 * now, the composer on the home page, so old links land there.
 */
export default function SubmitPage() {
  redirect("/");
}

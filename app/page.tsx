import { LendLoop } from "@/components/lendloop";
export default function Page() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_CONVEX_URL &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY,
  );
  return <LendLoop configured={configured} />;
}

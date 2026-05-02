import AppShell from "@/components/AppShell";

export default function GenerateLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}

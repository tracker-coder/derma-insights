import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ensureProfile } from "@/lib/users.functions";

export function useProfile() {
  const fetchProfile = useServerFn(ensureProfile);
  return useQuery({
    queryKey: ["profile"],
    queryFn: () => fetchProfile(),
    staleTime: 60_000,
  });
}

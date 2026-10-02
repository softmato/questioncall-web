import type {
  RegisterPayload,
  RegisterResponse,
} from "@/store/features/auth/types";

// fetch, not the axios client: this module is reached from the root Redux
// store, so axios would ship to every visitor for one sign-up request.
export async function registerUserRequest(
  payload: RegisterPayload,
): Promise<RegisterResponse> {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.message || data?.error || "Request failed.");
  }

  return data as RegisterResponse;
}

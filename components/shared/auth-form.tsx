"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { FormEvent, useEffect, useState, Suspense } from "react";

import { EyeIcon, EyeOffIcon } from "lucide-react";

import { LegalDialog } from "@/components/shared/legal-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSafeNavigationTarget } from "@/lib/navigation";
import { getSignInPath, getSignUpPath, getForgotPasswordPath } from "@/lib/user-paths";
import {
  clearAuthState,
  registerUser,
} from "@/store/features/auth/auth-slice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

type AuthFormProps = {
  mode: "login" | "register";
  role?: "STUDENT" | "TEACHER";
  callbackUrl?: string;
  /** Message for a sign-in that bounced back here, e.g. a refused Google account. */
  initialError?: string;
};

const defaultPathByRole = {
  STUDENT: "/",
  TEACHER: "/",
} as const;

export function AuthForm(props: AuthFormProps) {
  return (
    <Suspense fallback={<div>Loading form...</div>}>
      <AuthFormInner {...props} />
    </Suspense>
  );
}

function AuthFormInner({ mode, role, callbackUrl, initialError }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const refCodeRaw = searchParams.get("ref");
  const referralCodeFromUrl = refCodeRaw ? refCodeRaw.toUpperCase().trim() : undefined;
  const alternateRoleSignUpPath =
    mode === "register" && role
      ? appendQueryParam(
          getSignUpPath(role === "STUDENT" ? "TEACHER" : "STUDENT"),
          "ref",
          referralCodeFromUrl,
        )
      : null;
  
  const dispatch = useAppDispatch();
  const { registerError, registerStatus } = useAppSelector(
    (state) => state.auth,
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [formError, setFormError] = useState<string | null>(initialError ?? null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [verificationStep, setVerificationStep] = useState<"idle" | "requesting" | "pending_otp" | "verifying">("idle");

  const isRegister = mode === "register";
  const isSubmitting =
    (isRegister && registerStatus === "pending") || isSigningIn;
  const activeError = isRegister ? registerError ?? formError : formError;

  useEffect(() => {
    dispatch(clearAuthState());
  }, [dispatch, mode, role]);

  async function handleSendOtp() {
    if (!email) {
      setFormError("Please enter your email first.");
      return;
    }
    setFormError(null);
    setSuccess(null);
    setVerificationStep("requesting");
    try {
      const res = await fetch("/api/auth/verify-email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setVerificationStep("pending_otp");
      setSuccess("Verification code sent! Please check your inbox.");
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to send verification code.",
      );
      setVerificationStep("idle");
    }
  }

  async function handleVerifyOtp() {
    if (!otpCode) {
      setFormError("Please enter the code.");
      return;
    }
    setFormError(null);
    setSuccess(null);
    setVerificationStep("verifying");
    try {
      const res = await fetch("/api/auth/verify-email/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: otpCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setVerificationStep("idle");
      setIsEmailVerified(true);
      setSuccess("Email verified successfully! You can now complete your registration.");
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to verify the email code.",
      );
      setVerificationStep("pending_otp");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSuccess(null);
    dispatch(clearAuthState());
    let keepSubmitting = false;

    if (isRegister && !termsAgreed) {
      setFormError("You must agree to the terms and policy to register.");
      return;
    }

    if (isRegister && !isEmailVerified) {
      setFormError("You must verify your email before registering.");
      return;
    }

    try {
      if (isRegister && role) {
        const registerResult = await dispatch(
          registerUser({
            name,
            email,
            password,
            role,
            code: otpCode,
            referralCode: referralCodeFromUrl,
          }),
        );

        if (registerUser.rejected.match(registerResult)) {
          return;
        }

        setSuccess("Account created. Signing you in now...");
        setIsSigningIn(true);

        const signInResult = await signIn("credentials", {
          email,
          password,
          redirect: false,
          callbackUrl: defaultPathByRole[role],
        });

        if (signInResult?.error) {
          keepSubmitting = true;
          router.replace(getSignInPath());
          router.refresh();
          return;
        }

        keepSubmitting = true;
        router.replace(
          getSafeNavigationTarget(signInResult?.url, defaultPathByRole[role]),
        );
        router.refresh();
        return;
      }

      setIsSigningIn(true);

      const signInResult = await signIn("credentials", {
        callbackUrl: callbackUrl || "/",
        email,
        password,
        redirect: false,
      });

      if (signInResult?.error) {
        // A thrown authorize() error (rate limit, suspended, deleted) arrives
        // as its message; a plain wrong password as "CredentialsSignin".
        throw new Error(
          signInResult.error === "CredentialsSignin"
            ? "Invalid email or password."
            : signInResult.error,
        );
      }

      keepSubmitting = true;
      router.replace(
        getSafeNavigationTarget(signInResult?.url, callbackUrl || "/"),
      );
      router.refresh();
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Something went wrong.";
      setFormError(message);
    } finally {
      if (!keepSubmitting) {
        setIsSigningIn(false);
      }
    }
  }

  return (
    <div className="space-y-6">
      <form className="space-y-4" onSubmit={handleSubmit}>
        {isRegister ? (
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-foreground" htmlFor="auth-name">
              Name
            </Label>
            <Input
              id="auth-name"
              required
              autoComplete="name"
              className="h-11 rounded-xl bg-background px-3 py-2.5 text-sm shadow-sm md:text-sm"
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter your name"
              type="text"
              value={name}
            />
          </div>
        ) : null}

        {isRegister && referralCodeFromUrl ? (
          <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700">
            <span>🎉 Referred by a friend</span>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-foreground" htmlFor="auth-email">
            Email address
          </Label>
          <div className="relative flex gap-2">
            <Input
              id="auth-email"
              required
              disabled={isRegister && (verificationStep !== "idle" || isEmailVerified)}
              autoComplete="email"
              className="h-11 w-full rounded-xl bg-background px-3 py-2.5 text-sm shadow-sm md:text-sm"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Enter your email"
              type="email"
              value={email}
            />
            {isRegister && !isEmailVerified && (
              <Button 
                type="button" 
                variant="outline"
                className="h-11 shrink-0 px-4"
                onClick={handleSendOtp}
                disabled={verificationStep === "requesting" || email.trim().length === 0}
              >
                {verificationStep === "requesting" ? "Sending..." : verificationStep === "pending_otp" ? "Resend" : "Verify Email"}
              </Button>
            )}
            {isRegister && isEmailVerified && (
              <div className="flex h-11 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-emerald-600">
                Verified
              </div>
            )}
          </div>
        </div>

        {isRegister && (verificationStep === "pending_otp" || verificationStep === "verifying") && !isEmailVerified && (
          <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2">
            <Label className="text-sm font-semibold text-foreground" htmlFor="auth-otp">
              Verification Code
            </Label>
            <div className="flex gap-2">
              <Input
                id="auth-otp"
                className="h-11 rounded-xl bg-background px-3 py-2.5 text-sm font-mono shadow-sm md:text-sm"
                onChange={(event) => setOtpCode(event.target.value)}
                placeholder="000000"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otpCode}
              />
              <Button 
                type="button" 
                className="h-11 shrink-0"
                onClick={handleVerifyOtp}
                disabled={verificationStep === "verifying" || otpCode.length < 6}
              >
                {verificationStep === "verifying" ? "Verifying..." : "Confirm Code"}
              </Button>
            </div>
          </div>
        )}

        {(!isRegister || isEmailVerified) && (
        <>
          <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold text-foreground" htmlFor="auth-password">
              Password
            </Label>
            {!isRegister && (
              <Link 
                href={getForgotPasswordPath()} 
                className="text-xs font-medium text-primary hover:underline"
              >
                Forgot password?
              </Link>
            )}
          </div>
          <div className="relative">
            <Input
              id="auth-password"
              required
              autoComplete={isRegister ? "new-password" : "current-password"}
              className="h-11 rounded-xl bg-background px-3 py-2.5 pr-10 text-sm shadow-sm md:text-sm"
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={isRegister ? "Create a password" : "Enter your password"}
              type={showPassword ? "text" : "password"}
              value={password}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground focus:outline-none"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOffIcon className="h-5 w-5" />
              ) : (
                <EyeIcon className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        {isRegister && (
          <div className="mt-2 rounded-xl border border-border bg-muted/20 p-3">
            <div className="flex items-start gap-3">
              <Checkbox
                id="auth-terms"
                checked={termsAgreed}
                onCheckedChange={(checked) => setTermsAgreed(checked === true)}
                className="mt-0.5 h-5 w-5 rounded-[5px] border-slate-800 bg-white shadow-sm dark:border-white dark:bg-slate-950/60 data-[state=checked]:border-primary"
              />
              <div className="space-y-1">
                <Label className="cursor-pointer text-xs leading-5 text-muted-foreground" htmlFor="auth-terms">
                  I agree to the legal terms required for using this platform.
                </Label>
                <LegalDialog
                  triggerClassName="text-xs font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
                  triggerLabel="Terms and Policies"
                />
              </div>
            </div>
          </div>
        )}
        </>
        )}

        {activeError ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            {activeError}
          </div>
        ) : null}

        {success ? (
          <div className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-sm text-foreground">
            {success}
          </div>
        ) : null}

        <Button
          className="mt-4 h-11 w-full rounded-xl text-sm font-semibold shadow-sm"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting
            ? isRegister
              ? "Signing up..."
              : "Signing in..."
            : isRegister
              ? "Sign Up"
              : "Sign In"}
        </Button>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          className="h-11 w-full rounded-xl text-sm font-semibold shadow-sm"
          disabled={isSubmitting}
          onClick={async () => {
            setIsSigningIn(true);
            if (role) {
              document.cookie = `pending-role=${role}; path=/; max-age=3600; SameSite=Lax`;
            }
            if (referralCodeFromUrl) {
              document.cookie = `pending-referral=${referralCodeFromUrl}; path=/; max-age=3600; SameSite=Lax`;
            }
            await signIn("google", { callbackUrl: callbackUrl || "/" });
          }}
        >
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
            <path d="M1 1h22v22H1z" fill="none" />
          </svg>
          Google
        </Button>
      </form>

      <div className="rounded-2xl border border-border bg-muted/20 px-5 py-4 text-center text-sm text-muted-foreground">
        {isRegister ? (
          <>
            Have an account?{" "}
            <Link href={getSignInPath()} className="ml-1 font-semibold text-primary hover:underline">
              Sign In
            </Link>
            <div className="mt-3 text-sm text-muted-foreground">
              Registering differently?{" "}
              <Link
                href={alternateRoleSignUpPath || getSignUpPath(role === "STUDENT" ? "TEACHER" : "STUDENT")}
                className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
              >
                Switch Role
              </Link>
            </div>
          </>
        ) : (
          <>
            Don&apos;t have an account?{" "}
            <Link href={getSignUpPath("STUDENT")} className="ml-1 font-semibold text-primary hover:underline">
              Sign Up
            </Link>
            <p className="mt-3 text-sm text-muted-foreground">
              Want to teach instead?{" "}
              <Link
                href={getSignUpPath("TEACHER")}
                className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
              >
                Register as teacher
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function appendQueryParam(path: string, key: string, value?: string | null) {
  if (!value) {
    return path;
  }

  const params = new URLSearchParams();
  params.set(key, value);
  return `${path}?${params.toString()}`;
}

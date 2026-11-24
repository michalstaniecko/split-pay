/** Length of the email one-time code (`otpLength` in apps/api/src/auth.ts). */
export const OTP_LENGTH = 6;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normalised email, or null when the input is not an email address. */
export function parseEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  return EMAIL.test(email) ? email : null;
}

/** Digits of a typed or pasted code, cut to the code length. */
export function cleanOtp(input: string): string {
  return input.replace(/\D/g, '').slice(0, OTP_LENGTH);
}

export function isOtpComplete(otp: string): boolean {
  return otp.length === OTP_LENGTH && /^\d+$/.test(otp);
}

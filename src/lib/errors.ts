export class AuthError extends Error {
  constructor(
    public readonly code: "UNAUTHENTICATED" | "NO_TENANT" | "FORBIDDEN",
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

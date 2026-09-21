export {};

declare global {
  interface UserPublicMetadata {
    role?: "admin" | "user";
  }
}

import type { GuestAccessLevel } from "../guest-access";

export type ZeroAuthContext = {
  userId: string;
  guest?: {
    householdId: string;
    access: GuestAccessLevel;
  };
};

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    context: ZeroAuthContext;
  }
}

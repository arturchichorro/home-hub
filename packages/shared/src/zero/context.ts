export type ZeroAuthContext = {
  userId: string;
};

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    context: ZeroAuthContext;
  }
}

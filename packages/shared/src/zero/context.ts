export type ZeroAuthContext = {
  userId: string;
  // Injected by the server query gateway, never trusted from client context.
  serverNow?: number;
};

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    context: ZeroAuthContext;
  }
}

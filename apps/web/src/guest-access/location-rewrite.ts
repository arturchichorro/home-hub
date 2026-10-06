import type { LocationRewrite } from "@tanstack/react-router";

export function guestLocationRewrite(credential: string): LocationRewrite {
  return {
    // The fragment carries the credential, not an in-page scroll target.
    input: ({ url }) => {
      url.hash = "";
      return url;
    },
    // Include it in the same history update as navigation. Replacing the URL
    // after onResolved would notify the router and start another navigation.
    output: ({ url }) => {
      url.hash = credential;
      return url;
    },
  };
}

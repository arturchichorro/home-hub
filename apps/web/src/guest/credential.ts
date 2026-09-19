const guestCredentialPattern = /^[A-Za-z0-9_-]{43}$/;

export function guestCredentialFromHash(hash: string) {
  const credential = hash.startsWith("#") ? hash.slice(1) : hash;
  return guestCredentialPattern.test(credential) ? credential : undefined;
}

export function guestHash(credential: string) {
  return `#${credential}`;
}

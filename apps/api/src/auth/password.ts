import argon2 from "argon2";

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
  });
}

export async function verifyPassword(input: {
  password: string;
  passwordHash: string;
}): Promise<boolean> {
  return argon2.verify(input.passwordHash, input.password);
}

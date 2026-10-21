/**
 * A name's possessive, the way style guides write a plural-looking name: "Thunder Ears" -> "Thunder Ears'",
 * "Silver Whiskers" -> "Silver Whiskers'", "Rocket Snout" -> "Rocket Snout's". Pure: safe on server and client.
 */
export function possessive(name: string): string {
  const trimmed = name.trim();
  return /s$/i.test(trimmed) ? `${trimmed}'` : `${trimmed}'s`;
}

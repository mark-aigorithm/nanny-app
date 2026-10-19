/** How the console shows a mother: "First Last", dropping the '-' placeholder last name. */
export function displayName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName === '-' ? '' : lastName}`.trim();
}

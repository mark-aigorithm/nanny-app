/** The part of a ZodError a form needs — kept structural so this file needn't import zod. */
type IssueList = { issues: { path: PropertyKey[]; message: string }[] };

/** A form's validation failure as one line, naming the field: "name: Required". */
export function firstIssueMessage(error: IssueList): string {
  const issue = error.issues[0];
  if (!issue) return 'Check the form and try again.';
  const field = issue.path.map(String).join('.');
  return field ? `${field}: ${issue.message}` : issue.message;
}

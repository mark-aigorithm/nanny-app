/** What a question card shows against its fields when the draft is invalid. */
export type QuestionIssues = { prompt?: string; options?: string; badOptions: number[] };

export type DraftIssues = {
  title?: string;
  questions: Map<number, QuestionIssues>;
  /** One line per problem, in form order, naming where it is: "Question 2: write the question." */
  summary: string[];
};

type IssueList = { issues: { path: PropertyKey[]; message: string; code?: string }[] };

const sentence = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/**
 * Maps SurveyDraftSchema issues to the field they belong to, in operator
 * words — Zod's "Too small: expected string to have >=1 characters" means
 * "write the question" here.
 */
export function draftIssues(error: IssueList | undefined): DraftIssues {
  const result: DraftIssues = { questions: new Map(), summary: [] };
  if (!error) return result;
  const forQuestion = (i: number) => {
    const existing = result.questions.get(i);
    if (existing) return existing;
    const created: QuestionIssues = { badOptions: [] };
    result.questions.set(i, created);
    return created;
  };
  for (const issue of error.issues) {
    const [root, index, field, option] = issue.path;
    if (root === 'title') {
      result.title ??= issue.code === 'too_small' ? 'Give the survey a title.' : issue.message;
      result.summary.push(result.title);
      continue;
    }
    if (root !== 'questions' || typeof index !== 'number') {
      result.summary.push(issue.message);
      continue;
    }
    const q = forQuestion(index);
    const where = `Question ${index + 1}`;
    if (field === 'prompt') {
      q.prompt ??= issue.code === 'too_small' ? 'Write the question.' : issue.message;
      result.summary.push(`${where}: ${sentence(q.prompt)}`);
    } else if (field === 'options' && typeof option === 'number') {
      q.badOptions.push(option);
      q.options ??= 'Fill in every option, or remove the empty ones.';
      result.summary.push(`${where}: option ${option + 1} is empty.`);
    } else if (field === 'options') {
      q.options ??= issue.message;
      result.summary.push(`${where}: ${sentence(issue.message)}`);
    } else {
      result.summary.push(`${where}: ${sentence(issue.message)}`);
    }
  }
  return result;
}

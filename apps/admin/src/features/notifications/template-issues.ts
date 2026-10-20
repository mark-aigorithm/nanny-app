import type { NotificationTemplateInput } from '@nanny-app/shared';
import { NOTIFICATION_AUDIENCE_MAX_GROUPS, NOTIFICATION_AUDIENCE_MAX_MOTHERS } from '@nanny-app/shared';

export type TemplateField = 'name' | 'title' | 'body' | 'imageUrl' | 'link' | 'audience';

/** The element each problem lives on — the error summary links to and focuses it. */
export const TEMPLATE_FIELD_ID: Record<TemplateField, string> = {
  name: 'notification-name',
  title: 'notification-title',
  body: 'notification-body',
  imageUrl: 'notification-image',
  link: 'notification-link',
  audience: 'notification-audience',
};

/** Form order: the summary lists problems top to bottom, as the fields appear. */
const ORDER: readonly TemplateField[] = ['name', 'title', 'body', 'imageUrl', 'link', 'audience'];

export type TemplateIssues = Partial<Record<TemplateField, string>>;

type IssueList = { issues: { path: PropertyKey[]; message: string; code?: string }[] };

/**
 * NotificationTemplateInputSchema issues → one message per field, in operator
 * words ("Write a title." rather than Zod's "String must contain at least 1
 * character(s)"). The first issue on a field wins.
 */
export function templateIssues(
  error: IssueList | undefined,
  values: Pick<NotificationTemplateInput, 'targetType' | 'audience'>,
): TemplateIssues {
  const out: TemplateIssues = {};
  if (!error) return out;
  const mothers = values.audience.type === 'MOTHERS';
  for (const issue of error.issues) {
    const [root] = issue.path;
    const tooSmall = issue.code === 'too_small';
    const tooBig = issue.code === 'too_big';
    if (root === 'name') out.name ??= tooSmall ? 'Give the template a name.' : issue.message;
    else if (root === 'title') out.title ??= tooSmall ? 'Write a title.' : issue.message;
    else if (root === 'body') out.body ??= tooSmall ? 'Write the message.' : issue.message;
    else if (root === 'imageUrl') out.imageUrl ??= 'The image didn’t upload properly. Choose it again.';
    else if (root === 'targetType' || root === 'packageId' || root === 'promoCodeId') {
      out.link ??=
        values.targetType === 'PACKAGE'
          ? 'Choose the package to link to.'
          : values.targetType === 'PROMO_CODE'
            ? 'Choose the promo code to link to.'
            : issue.message;
    } else if (root === 'audience') {
      out.audience ??= tooSmall
        ? mothers
          ? 'Choose at least one mother.'
          : 'Choose at least one group.'
        : tooBig
          ? mothers
            ? `Choose at most ${NOTIFICATION_AUDIENCE_MAX_MOTHERS.toLocaleString('en-US')} mothers.`
            : `Choose at most ${NOTIFICATION_AUDIENCE_MAX_GROUPS} groups.`
          : issue.message;
    }
  }
  return out;
}

export function issueSummary(issues: TemplateIssues): { field: TemplateField; message: string }[] {
  return ORDER.flatMap((field) => {
    const message = issues[field];
    return message ? [{ field, message }] : [];
  });
}

import { isSurveyPush, navigateToSurvey } from '@mobile/lib/notificationNavigation';
import { wasSurveyPrompted } from '@mobile/store/surveyPromptStore';

describe('survey push', () => {
  it('recognises a survey push with an id', () => {
    expect(isSurveyPush({ type: 'SURVEY', surveyId: '4' })).toBe(true);
    expect(isSurveyPush({ type: 'SURVEY' })).toBe(false);
    expect(isSurveyPush({ type: 'SURVEY', surveyId: 'abc' })).toBe(false);
    expect(isSurveyPush({ type: 'SURVEY', surveyId: '0' })).toBe(false);
    expect(isSurveyPush({ type: 'BOOKING_MESSAGE', surveyId: '4' })).toBe(false);
  });

  it('opens the survey screen', () => {
    const router = { push: jest.fn() };
    navigateToSurvey(router as never, 4);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(parent)/survey',
      params: { surveyId: '4' },
    });
  });

  // Push tap and the notifications list both open it this way; the prompt
  // sheet must not then pop up over the survey she just opened.
  it('marks the survey prompted before opening it', () => {
    let promptedAtPush = false;
    const router = { push: jest.fn(() => { promptedAtPush = wasSurveyPrompted(5); }) };
    navigateToSurvey(router as never, 5);
    expect(promptedAtPush).toBe(true);
  });
});

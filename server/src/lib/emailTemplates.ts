export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** One paragraph-per-line layout shared by every message — deliberately plain, since most of these are read on a phone. */
function build(subject: string, paragraphs: string[], action?: { label: string; url: string }): EmailContent {
  const text = [...paragraphs, ...(action ? [`${action.label}: ${action.url}`] : [])].join("\n\n");
  const html = [
    ...paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`),
    ...(action
      ? [
          `<p style="margin:0 0 16px"><a href="${escapeHtml(action.url)}" style="background:#1c7ed6;color:#fff;padding:10px 16px;border-radius:4px;text-decoration:none;display:inline-block">${escapeHtml(action.label)}</a></p>`,
          `<p style="margin:0 0 16px;color:#666;font-size:13px">If the button doesn't work, copy this link into your browser:<br>${escapeHtml(action.url)}</p>`,
        ]
      : []),
  ].join("");
  return { subject, text, html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:560px">${html}</div>` };
}

export function invitationEmail(input: { name: string; url: string }): EmailContent {
  return build(
    "You've been invited to OutcomeLink",
    [`Hello ${input.name},`, "An account has been created for you on OutcomeLink. Use the link below to choose your password. It can be used once and expires in 7 days."],
    { label: "Set your password", url: input.url },
  );
}

export function passwordResetEmail(input: { name: string; url: string }): EmailContent {
  return build(
    "Reset your OutcomeLink password",
    [`Hello ${input.name},`, "An administrator started a password reset for your OutcomeLink account. Use the link below to choose a new password. It can be used once and expires in 7 days.", "If you weren't expecting this, contact your administrator."],
    { label: "Choose a new password", url: input.url },
  );
}

export function graduateSurveyEmail(input: { firstName: string; institutionName: string; url: string }): EmailContent {
  return build(
    `${input.institutionName}: a short graduate survey`,
    [`Hello ${input.firstName},`, `${input.institutionName} would like to hear how things are going since you finished your program. It takes only a few minutes.`],
    { label: "Take the survey", url: input.url },
  );
}

export function employerSurveyEmail(input: {
  contactName: string;
  studentName: string;
  institutionName: string;
  url: string;
}): EmailContent {
  return build(
    `${input.institutionName}: employer feedback on ${input.studentName}`,
    [`Hello ${input.contactName},`, `${input.institutionName} is asking employers of our graduates for brief feedback. ${input.studentName} is on record as working with your organization. The survey takes only a few minutes.`],
    { label: "Give feedback", url: input.url },
  );
}

export function staffNotificationEmail(input: { name: string; message: string; url: string }): EmailContent {
  return build(
    "OutcomeLink notification",
    [`Hello ${input.name},`, input.message],
    { label: "Open OutcomeLink", url: input.url },
  );
}

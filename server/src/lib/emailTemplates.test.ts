import { escapeHtml, graduateSurveyEmail, invitationEmail, staffNotificationEmail } from "./emailTemplates";

describe("email templates", () => {
  it("escapes HTML in every interpolated value so a name or message can't inject markup", () => {
    expect(escapeHtml(`<b>"x" & 'y'</b>`)).toBe("&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;");

    const email = staffNotificationEmail({ name: "<script>alert(1)</script>", message: "5 < 6 & more", url: "https://app.example/?a=1&b=2" });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("5 &lt; 6 &amp; more");
    expect(email.html).toContain('href="https://app.example/?a=1&amp;b=2"');
  });

  it("puts the link in both the text and HTML parts", () => {
    const email = invitationEmail({ name: "Ada", url: "https://app.example/set-password/abc" });
    expect(email.text).toContain("https://app.example/set-password/abc");
    expect(email.html).toContain("https://app.example/set-password/abc");
    expect(email.text).toContain("Hello Ada");
  });

  it("names the institution in the survey subject", () => {
    expect(graduateSurveyEmail({ firstName: "Grace", institutionName: "Mountain West", url: "https://x/y" }).subject).toContain("Mountain West");
  });
});

# README #

### What is this repository for? ###

Some tools for working with Jira data locally.  These are easier to
develop and see than Jira plugins, and can be used with Jira Cloud
where you may not have the option of installing a custom plugin.

#### TimeCard ####

A simple, ugly single page app which reports the time you have logged
in Jira today, sorted by start time.  It reports ticket, start time,
end time, duration, and work log comment.  The ticket ID is a link to
the ticket's work log so you can click through to edit if desired.

There are fields for user ID (e.g., dev@example.com) and password
(whatever you would use to authenticate to Jira).

If you check "Remember Me" the encoded (not encrypted) credentials are
stored in browser local storage so you don't have to enter them next
time.  DO NOT DO THIS on a shared computer.  Unchecking and submitting
clears the local storage.


### How do I get set up? ###

These tools are best used when installed as static content in the same
Tomcat instance used to host your Jira Server.  If you are using Jira
Cloud they can be used from a local clone but require some browser
shenanigans because Jira doesn't do CORS correctly.

#### Jira Server Setup

1. Clone this repo
2. Copy the files to /opt/jiratools/ on your Jira server
3. Add an additional Context added to
/opt/atlassian/jira/conf/server.xml as described at
https://www.moreofless.co.uk/static-content-web-pages-images-tomcat-outside-war/.
Specifically:

  $ diff server.xml-orig server.xml
  99c99
  <
  ---
  >                 <Context docBase="/opt/jiratools" path="/static" />

4. Access at `https:jira.yourdomain.local/static/` adding `timecard.html`, `projection.html`, etc.

#### Local use for Jira Cloud

* This is only known to work with Chrome

1. Clone this repo
2. Install https://chrome.google.com/webstore/detail/allow-control-allow-origi/nlfbmbojpeacfghkpbjhddihlkkiljbi?hl=en
3. Enable it
4. Configure it to intercept "https://yourCompany.atlassian.net/rest/api/*"
5. Navigate to the "Time Card" directory and open `index.html` in Chrome
6. Enter your user ID, password, and filter and click Submit

### Contribution guidelines ###

Have at it!

### Who do I talk to? ###

Contact Chris.Nelson.PE@gmail.com with questions or suggestions.

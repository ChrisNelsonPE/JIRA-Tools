# README #

This README would normally document whatever steps are necessary to get your application up and running.

### What is this repository for? ###

This is a simple, ugly single page app which reports the time you have logged in JIRA today, sorted by start time.  It reports ticket, start time, end time, duration, and work log comment.  The ticket ID is a link to the ticket's work log so you can click through to edit if desired.

There are fields for user ID (e.g., dev@example.com) and password (whatever you would use to authenticate to JIRA.

If you check "Remember Me" the encoded (not encrypted) credentials are stored in browser local storage so you don't have to enter them next time.  DO NOT DO THIS on a shared computer.  Unchecking and submitting clears the local storage.


### How do I get set up? ###

* This is only known to work with Chrome
* This relies on a "Recent Work" filter which has JQL like "worklogAuthor = yourName AND updated > -8h"

1. Clone this repo
2. Install https://chrome.google.com/webstore/detail/allow-control-allow-origi/nlfbmbojpeacfghkpbjhddihlkkiljbi?hl=en
3. Enable it
4. Configure it to intercept "https://yourCompany.atlassian.net/rest/api/*"
5. Open `jiraTime.html` in Chrome
6. Enter your user ID and password and click Submit

### Contribution guidelines ###

Have at it!

### Who do I talk to? ###


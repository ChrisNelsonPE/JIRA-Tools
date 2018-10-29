#!/bin/python
import requests
import os
import getpass
import sys
import platform
import argparse
import json

# Use `./createIssue.py --help` for documentation

parser = argparse.ArgumentParser(formatter_class=argparse.RawDescriptionHelpFormatter,
                                 description="Create an new Jira issue.",
                                 epilog="""
The fields for the body of the REST request are taken from command
line parameters but may also be specified in a file.

Project, summary, description, and type must all be supplied.  Other
parameters are optional.

The file may contain all or some of the parameters.  The file is
loaded first and then command line arguments override values from the
file.

The file is in JSON format like:

  {
    "project" : { "key": "MYPROJ" },
    "summary": "A line summarizing the issue",
    "description": "A sentence or paragraph or more describing the issue",
    "issuetype": { "name" : "Issue" }
    ...
  }

Values from the file are added to the "fields" part of the REST
request body.  Some are simple strings, some are structured.  See
https://developer.atlassian.com/server/jira/platform/jira-rest-api-examples/#creating-an-issue-examples
for details.""")

# TODO - blocks, blocking

# FUTURE - default root to some environment variable
parser.add_argument("-j", "--jiraroot",
                    default="https://jira.automate.local",
                    help="Base URL for the Jira server")

parser.add_argument("-c", "--credential",
                    default=os.environ["HOME"] + "/.jiraCredential",
                    help="File containing HTTP basic authentication token")

parser.add_argument("-p", "--project",
                    default="",
                    help="Jira project to create issue in. (Case sensitive.)")

parser.add_argument("-s", "--summary",
                    default="",
                    help="Issue summary")

parser.add_argument("-d", "--description",
                    default="",
                    help="Issue description")

parser.add_argument("-t", "--type",
                    default="",
                    help="Issue type (e.g., Bug, Task; Case sensitive.)")

parser.add_argument("-a", "--assignee",
                    default="",
                    help="User name of assignee")

parser.add_argument("-P", "--parent",
                    default="",
                    help="""Key of parent issue
                          (built-in subtask relationship; Discouraged.)""")

parser.add_argument("-S", "--subtaskof",
                    default="",
                    help="""Key of parent issue
                          (named 'Subtask' relationship; Preferred.)""")

parser.add_argument("-o", "--other",
                    default="",
                    help="Key of issue to link to")

parser.add_argument("-l", "--link",
                    default="",
                    help="Name of link type to create (e.g. Blocks)")

parser.add_argument("-x", "--extrafields",
                    nargs="*",
                    default=[],
                    help="""Other issue fields to pass to Jira.
                          Each EXTRAFIELD is a name/value pair
                          (separated by spaces).  Values may be
                          JSON like '{\"name\":\"Major\"}'.""")

parser.add_argument("-f", "--file",
                    default="",
                    help="JSON file containing issue data")

args = parser.parse_args()


def linkIssues(apiRoot, headers, name, fromIssue, toIssue):
    jsonBody = {
        "type" : { "name" : name },
        "inwardIssue" : { "key" : fromIssue },
        "outwardIssue" : { "key" : toIssue }
    }

    r = requests.post(apiRoot + "/issueLink/",
                      headers=headers,
                      json=jsonBody)
    if not r.ok:
        return (str(r.status_code) + " " +
                " could not create '" +
                name + "' link from " + fromIssue + " to " + toIssue +
                r.status_code + " " + r.reason + "\n" + r.text)
    else:
        return ""
    

if len(args.file) > 0:
    f = open(args.file, "r")
    fields = json.loads(f.read())
    f.close()
else:
    fields = {}

validationMessages = []

if len(args.project) > 0:
    fields["project"] = { "key" : args.project }
elif not "project" in fields:
    validationMessages.append("Project key required.")

if len(args.summary) > 0:
    fields["summary"] = args.summary
elif not "summary" in fields:
    validationMessages.append("Issue summary required.")

if len(args.description) > 0:
    fields["description"] = args.description
elif not "description" in fields:
    validationMessages.append("Issue description required.")

# Wherever the desription comes from, add a robot disclaimer
fields["description"] +=("\n----\nCreated on " + platform.node()
                         + " by " + sys.argv[0]
                         + " on behalf of " + getpass.getuser())

if len(args.type) > 0:
    fields["issuetype"] = { "name" : args.type }
elif not "issuetype" in fields:
    validationMessages.append("Issue type required (-t parameter or 'issuetype' in file).")

# If extrafields is provided, it must be even length
if len(args.extrafields) % 2 != 0:
    validationMessages.append("Extra fields value must be n1 v1 n2 v2 ...")
    
# The following parameters are optional so no need to validate they exist
if len(args.assignee) > 0:
    fields["assignee"] = { "name" : args.assignee }


if len(validationMessages) > 0:
    sys.exit("\n".join(validationMessages))

# Pop name/value pairs from the front of the list and add to fields
while len(args.extrafields) > 0:
    fieldName = args.extrafields.pop(0)
    fieldValue = args.extrafields.pop(0)
    try:
        fields[fieldName] = json.loads(fieldValue)
    except:
        fields[fieldName] = fieldValue


# Get Jira credential token from file
f = open(args.credential, "r")
# Read the first line and remove the trailing newline (if present)
credential = f.readline().rstrip()
f.close()

# Note: consistently without trailing slash.
# FIXME - check for tailing slash in jiraroot?
apiRoot = args.jiraroot + "/rest/api/2"

jsonBody = { "fields" : fields }

headers = { "Authorization": "Basic "+credential }

r = requests.post(apiRoot + "/issue/",
                  headers=headers,
                  json=jsonBody)
responseData = r.json()

if r.status_code != requests.codes.created:
    sys.exit("Got " + str(r.status_code) +
             "; expected " + str(requests.codes.created) +
             r.reason + "\n" + r.text)

issueKey = responseData[u'key']


# If an "other" issue was specified, create the specified link
if len(args.other) > 0:
    m = linkIssues(apiRoot, headers, args.link, args.other, issueKey)
    if len(m) > 0:
        sys.exit(issueKey + " created but " + m)


# If subtaskof was specified, create the link
if len(args.subtaskof) > 0:
    m = linkIssues(apiRoot, headers, "Subtask", args.subtaskof, issueKey)
    if len(m) > 0:
        sys.exit(issueKey + " created but " + m)

# Return the key of the issue created by the first POST
print(issueKey)

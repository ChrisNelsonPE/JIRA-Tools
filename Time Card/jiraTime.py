#!/bin/python
import requests
import datetime
import os
import sys
import smtplib
import platform
import argparse

from email.mime.text import MIMEText

# FUTURE - find ticket activity (updated) without work log and report
# "updated with no time logged" in another section of the email.

parser = argparse.ArgumentParser(description="Report time logged in Jira.",
                                 epilog="""
If --include is specified, only those users are processed.  
Otherwise, all users in the specified group are processed 
except those specified with --exclude.""")

parser.add_argument("-g", "--group",
                    default="",
                    required=True,
                    help="The Jira group to report on")

parser.add_argument("-x", "--exclude",
                    nargs="*",
                    default=[],
                    help="Jira user names to exclude")

parser.add_argument("-i", "--include",
                    nargs="*",
                    default=[],
                    help="Jira user names to process")

parser.add_argument("-c", "--credential",
                    default=os.environ["HOME"] + "/.jiraCredential",
                    help="File containing HTTP basic authentication token")

parser.add_argument("-s", "--summary",
                    action="store_true",
                    default=False,
                    help="Output summary, no email")

args = parser.parse_args()


# Get Jira credential token from file
f = open(args.credential, "r")
# Read the first line and remove the trailing newline (if present)
credential = f.readline().rstrip()
f.close()

# NOTE: Consistently no trailing slash
jiraRoot = "https://jira.automate.local"
apiRoot = jiraRoot + "/rest/api/2"

# Get members of the group
query = "/group?groupname=" + args.group + "&expand=users"
headers = { "Authorization": "Basic "+credential }
r = requests.get(apiRoot + query, headers=headers)
responseData = r.json()

# Make a hash of users in the response which we should process.
# * If there is a list of users to include and this name is in it
# * or the name is not in the list of users to exclude
#
# Index is user name (e.g., cnelson), value is the Jira user object.
# We are going to want emailAddress and displayName but why bother
# processing it too much?
users = {}
for user in responseData["users"]["items"]:
    if len(args.include) > 0:
        if user["name"] in args.include:
            users[user["name"]] = user
    elif not user["name"] in args.exclude:
        users[user["name"]] = user


today = datetime.datetime.now().strftime("%Y-%m-%d")


# Filter is something like "worklogAuthor in membersof(my-group)".
# (Where "my-group" should match the group configured at the top of
# this file.)  We add a date range in the query.
filterNumber="18104"

# Get tickets with recent work logs.
query = "/search?maxResultes=1000"
query += "&jql=filter=" + filterNumber
query += " and worklogDate >= " + today

r = requests.get(apiRoot + query, headers=headers)
responseData = r.json()


# Each element of the hash is an array of work logs
workByUser = {}

# Iterate over issues, get key, get work for each
for issue in responseData["issues"]:
    query = "/issue/" + issue["key"] + "/worklog"
    
    r = requests.get(apiRoot + query, headers=headers)
    responseData = r.json()
    
    for worklog in responseData["worklogs"]:
        author = worklog["author"]["name"]
        key = issue["key"]
        secondsSpent = worklog["timeSpentSeconds"]

        if author in users and worklog["started"][:10] >= today:
            if not author in workByUser:
                # print("Adding " + author + " to hash")
                workByUser[author] = {}

            if not key in workByUser[author]:
                # print("Adding " + key + " to " + author + "\'s hash")
                workByUser[author][key] = 0

            workByUser[author][key] += secondsSpent

            
# Report work
for author in users:
    name = users[author]["displayName"]
    email = users[author]["emailAddress"]
    
    header = "On " + today + ", " + name + " (" + author + ") logged work on "
    body = ""
    if not author in workByUser:
        header += "no tickets."
    else:
        header += str(len(workByUser[author])) + " tickets.\n"
        authorSeconds = 0
        for ticket in workByUser[author]:
            ticketSeconds = 1.0 * workByUser[author][ticket]
            authorSeconds += ticketSeconds
            ticketHours = round(ticketSeconds/(60*60), 2)
            body += "  " + ticket + ": " + str(ticketHours) + " hours\n"
        
        authorHours = round(authorSeconds/(60*60), 2)
        body += "Total: " + str(authorHours) + "\n\n"

    authorReport = header + "\n" + body

    # If just summarizing, print it and cron will deliver it
    if args.summary:
        print(authorReport)
    # Otherwise, if we have a place to email it send the report to the
    # developer
    elif "MAILTO" in os.environ:
        # TODO - add a -f/--footer option to read a file and append it
        # to every email
        footer = ("Created on " + platform.node()
                  + " by " + sys.argv[0]
                  + " on behalf of " + os.environ["MAILTO"])
        authorReport +=  "\n" + footer
        
        # Adapted from https://stackoverflow.com/questions/1546367
        # Send to this user's email address
        toAddr = email
        # Send on behalf of the cron owner.
        fromAddr = os.environ["MAILTO"]
        cc = [ fromAddr ]
        subject = "Jira time for " + name + " on " + today
        msg = ("From: %s\r\n" % fromAddr
           + "To: %s\r\n" % toAddr
           + "CC: %s\r\n" % ",".join(cc)
           + "Subject: %s\r\n" % subject
           + "\r\n"
           + authorReport)
        toAddrs = [toAddr] + cc
        s = smtplib.SMTP('localhost')
        s.sendmail(fromAddr, toAddrs, msg)
        s.quit()

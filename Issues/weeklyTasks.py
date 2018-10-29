#!/bin/python
import subprocess
import sys
import datetime
import os

# Assume this script is a neighbor of the create issue script it uses.
pwd = os.path.dirname(os.path.abspath(__file__))

now = datetime.datetime.now()

summary = "Tasks for the week of " + now.strftime("%Y-%m-%d")
description = "This stuff needs to get done every week"

# First create a parent
createCommand = [pwd + '/createIssue.py',
                 '-p', 'CHRIS',
                 '-s', summary,
                 '-d', description,
                 '-t', 'Task']

try:
    parentKey = subprocess.check_output(createCommand).rstrip()
    print("Created recurring task " + parentKey + ": " + summary)
except subprocess.CalledProcessError as e:
    print("Error " + e.returncode + " trying to execute " + e.cmd)


# Then create children
for dow in ["Mon", "Tue", "Wed", "Thu", "Fri"]:
    summary = "Stuff to do on " + dow
    description = "Another day, another dollar"

    createCommand = [pwd + '/createIssue.py',
                     '-p', 'CHRIS',
                     '-s', summary,
                     '-d', description,
                     '-S', parentKey,
                     '-t', 'Task']

    try:
        childKey = subprocess.check_output(createCommand).rstrip()
        print("Created recurring task " + childKey + ": " + summary)
    except subprocess.CalledProcessError as e:
        print("Error " + e.returncode + " trying to execute " + e.cmd)

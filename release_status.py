#!/bin/python

from datetime import datetime
from datetime import timedelta
from datetime import date

import argparse
import base64
import datetime
import json
import logging
import os
import os.path
import requests
import socket
import re
import getpass

parser = argparse.ArgumentParser(description="Report status of releases.",
                                 epilog="""
What actions should be complete by certain days before release.""")

parser.add_argument("-p", "--project",
                    default="",
                    required=True,
                    help="The Jira project to report on")

parser.add_argument("-c", "--credential",
                    default=os.environ["HOME"] + "/.jiraCredential",
                    help="File containing HTTP basic authentication token")

args = parser.parse_args()


# Get the host part of the Jira API URL from JIRA_HOST in the environment.
#
# Default to jira.<current domain> if JIRA_HOST not set.  That is, on
# host.example.com, return jira.example.com
def jira_host():
    jira_host = os.environ.get("JIRA_HOST")
    if jira_host == None:
        parts = socket.getfqdn().split('.')
        parts[0] = 'jira'
        jira_host = '.'.join(parts)

    return jira_host


# Get the credentials to access the Jira server from the environment.
#
# * JIRA_USER is the user name.  Defaults to the user running the script.
# * JIRA_PASSWORD is required.
#
# Returns an HTTP basic authentication token
def jira_credential():
    if os.path.isfile(args.credential):
        f = open(args.credential)
        # Need to remove the trailing newline
        credential = f.read().rstrip()
        return credential
        
    # Make a credential token from environment variables
    jira_user = os.environ.get("JIRA_USER")
    if jira_user == None:
        jira_user = getpass.getuser()

    jira_password = os.environ.get("JIRA_PASSWORD")
    if jira_password == None:
        logging.error('No password found for {0}'.format(jira_user))
        return None


    credential = base64.b64encode((jira_user + ':' + jira_password).encode())
    jira_password = None
    
    return credential
    

# Return a value suitable for using as the verify parameter for
# requests.get(), etc.
def jira_cert():
    jira_cert = os.environ.get('JIRA_CERT')
    if jira_cert == None:
        jira_cert = False
        
    return jira_cert


def get_project_releases(project_name):
    credential = jira_credential()
    if credential == None:
        return

    jira_root = 'https://' + jira_host()
    api_root = jira_root + '/rest/api/2'

    r = requests.get(api_root + '/project/' + project_name + '/versions',
                     headers= { "Authorization": "Basic " + credential },
                     verify=jira_cert())

    if r.status_code != requests.codes.ok:
        msg = 'Getting releases got ' + str(r.status_code) + \
            '; expected ' + str(requests.codes.ok) + \
            r.reason + '\n' + r.text
        logging.error(msg)
        return []

    releases = r.json()

    # Filter to scheduled (has a release date), not released, and not archived
    releases = [r for r in releases \
                if 'releaseDate' in r \
                and r['released'] != True \
                and r['archived'] != True]

    return releases


def notify_step(releaseDate, days_to_release, description):
    deadline = releaseDate + timedelta(days = -days_to_release)
    
    if (deadline == date.today()):
        deadline = 'TODAY'

    print('  {0} {1}'.format(deadline, description))
    

def notify_release(release):
    today = date.today()
    
    releaseDate = datetime.datetime.strptime(release['releaseDate'], '%Y-%m-%d').date()
    
    delta = releaseDate - today

    days_to_release = delta.days
    
    if days_to_release >= 15:
        return

    if days_to_release < 0:
        when = 'overdue by {0} days'.format(-days_to_release)
    elif days_to_release == 0:
        when = 'scheduled for release today'
    else:
        when = 'scheduled for release in {0} days'.format(days_to_release)
        
    print('{0} {1} ({2})'.format(release['name'], when, release['releaseDate']))

    
    # Customize as needed
    limits = {
        1  : '...One',
        2  : '...Two...',
        3  : 'Three...',
        7  : 'One week until release',
        14 : 'Two weeks until release.'
    }


    # Message based on release calendar
    for limit in sorted (limits.keys()):
        if days_to_release <= limit:
            notify_step(releaseDate, limit, limits[limit])

    print('')
    
    
releases = get_project_releases(args.project)

# Sort by release date
releases = sorted(releases, key = lambda i: i['releaseDate'])


for r in releases:
    notify_release(r)

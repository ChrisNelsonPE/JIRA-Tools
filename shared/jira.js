// Functions for iteracting with Jira; mostly queries to get issues, releases,
// etc.

var JiraService = angular.module('JiraService', []);

JiraService.factory('Jira', ['$http', '$q', function($http, $q) {
    // Private functions and variables

    var config = {};

    var customFields = {};

    // Helper for getProjectReleases().
    var getOneProjectReleases = function(projectName) {
        var deferred = $q.defer();
        var url = "https://" + config.domain + "/rest/api/2/";
        url += 'project/' + projectName + '/versions';
        $http({
            url: url,
            method: 'GET',
            headers: { "Authorization": "Basic " + config.credential }
        })
            .then(function successCallback(response) {
                deferred.resolve(response.data.filter(
                    r => !r.released && !r.archived));
            }, function errorCallback(response) {
                // CORS is handled by the client but we want to pass
                // something back to the caller.
                if (response.status == 0 && response.statusText == "") {
                    response.status = 403;
                    response.statusText =
                        "Getting project releases failed in a way" +
                        " that suggests a CORS issue.  See the README" +
                        " for notes about installing and configuring" +
                        " the Allow-Control-Allow-Origin plugin.";
                    alert(response.statusText);
                }
                deferred.reject(response);
            });
        return deferred.promise;
    };

    // options is a hash of query options.
    // * includeUnscheduled - also include releases without a release date
    // * projects - a comma-delimited list of projects to search in
    //   (only used if includeUnscheduled is true)
    // * limitToGroup - only include issues assigned to group
    // * group - Jira group to include issues for (only used if
    //   limitToGroup is true)
    //
    // Returns a JQL query string
    var buildReleaseIssuesQuery = function(options, releases) {
        var scheduledClause = "";
        var unscheduledClause = "";
        
        if (releases.length != 0) {
            var releaseNames  = releases.map(function(r) {
                return r.name;
            });

            // Always include the issues with fixVersion in the release list
            scheduledClause = "fixVersion in ("
                + "\"" + releaseNames.join('","') + "\""
                + ")";
        }

        // Include issues without a fixVersion in the last chart.
        // This relies on projects being well formed but we've used
        // it already above so that's likely safe.
        if (options.includeUnscheduled) {
            unscheduledClause = "(fixVersion IS EMPTY"
                + " AND project IN (" + options.projects + "))"
        }

        var query;
        if (scheduledClause.length == 0) {
            query = unscheduledClause;
        }
        else if (unscheduledClause.length == 0) {
            query = scheduledClause;
        }
        else {
            query = "(" + scheduledClause + " OR " + unscheduledClause + ")";
        }

        query += " AND statusCategory != Done";
        if (options.limitToGroup && options.group.length > 0) {
            query += " AND (assignee IN membersOf(" + options.group + ")"
                + " OR assignee IS Empty)";
        }

        return query;
    };


    // Public functions
    var jira = {};

    // Set the domain and credential used to access Jira.
    jira.config = function(domain, credential) {
        config.domain = domain;
        config.credential = credential;
    };
    
    // Returns a promise.  When that promise is satisfied, the
    // data passed back is a list of issues matching the query.
    //
    // jqlQuery - JQL query suitable for issue search
    jira.getIssues = function(jqlQuery) {
        var deferred = $q.defer();

        var url = "https://" + config.domain + "/rest/api/2/";
        url += "search?jql=" + jqlQuery;
        url += "&maxResults=1000";
        
        $http({
            url: url,
            method: "GET",
            headers: { "Authorization": "Basic " + config.credential }
        })
            // FUTURE - handle paged data.  We're not done if
            // data.startAt + data..maxResults < data.total Asking for
            // 1000 results, above, gets around this for now.
            .then(function successCallback(response) {
                deferred.resolve(response.data.issues);
            }, function errorCallback(response) {
                // CORS is handled by the client but we want to pass
                // something back to the caller.
                if (response.status == 0 && response.statusText == "") {
                    response.status = 403;
                    response.statusText =
                        "Getting recent issue data failed in a way" +
                        " that suggests a CORS issue.  See the README" +
                        " for notes about installing and configuring" +
                        " the Allow-Control-Allow-Origin plugin.";
                    alert(response.statusText);
                }
                deferred.reject(response);
            });

        return deferred.promise;
    };

    // Get releases for one or more projects
    //
    // projectNames - a string like "FOO,BAR" or an array of strings
    //                like ["FOO", "BAR"]
    //
    // Returns a promise which is resolved with an array of releases
    // for all the listed projects
    jira.getProjectReleases = function(projectNames) {
        var deferred = $q.defer();
        
        var projectNameArray;
        if (typeof(projectNames) === 'string') {
            // Split the projects list string into an array
            projectNameArray = projectNames.split(',').map(function(p) {
                return p.trim();
            });
        }
        else if (typeof(projectNames) === 'object') {
            projectNameArray = projectNames;
        }
        else {
            console.log('getProjectReleases() called with invalid argument');
            deferred.reject();
        }

        Promise.all(projectNameArray.map(function(projectName) {
            return getOneProjectReleases(projectName);
        })).then(function successCallback(results) {
            var releases = [];
            for (var i = 0; i < results.length; ++i) {
                releases = releases.concat(results[i]);
            }
            deferred.resolve(releases);
        });
        return deferred.promise;
    };

    jira.getReleaseIssues = function(options, releases) {
        return jira.getIssues(buildReleaseIssuesQuery(options, releases));
    };

    // Add custom fields to the list managed by the service.
    //
    // fields - a hash of custom field names indexed by "simple" names
    //          like { "storyPoints" : "customfield_10002" }
    //
    // Returns the entire list of fields known to the service
    jira.customFields = function(fields) {
        angular.forEach(fields, function(value, key) {
            customFields[key] = value;
        });
        return customFields;
    };

    // Get the custom field name for a simple name.
    jira.customFieldName = function(simpleName) {
        if (customFields.hasOwnProperty(simpleName)) {
            return customFields[simpleName];
        }
        else {
            return undefined;
        }
    };

    // Get a field value from an issue.  Return the default value
    // if issue does not have the field.
    //
    // fieldName - a simple or custom field name
    jira.fieldValue = function(issue, fieldName, defaultValue = undefined) {
        if (customFields.hasOwnProperty(fieldName)) {
            fieldName = customFields[fieldName];
        }
        if (issue.fields.hasOwnProperty(fieldName)) {
            return issue.fields[fieldName];
        }
        return defaultValue;
    };
    
    return jira;
}]);

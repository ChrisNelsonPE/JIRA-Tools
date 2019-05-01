// Functions for iteracting with Jira; mostly queries to get issues, releases,
// etc.

var JiraService = angular.module('JiraService', []);

JiraService.factory('Jira', ['$http', '$q', function($http, $q) {
    // Private functions and variables

    var config = {};


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

    return jira;
}]);

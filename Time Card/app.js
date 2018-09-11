var app = angular.module('jiratime', []);

// This only works if you
// * install
// https://chrome.google.com/webstore/detail/allow-control-allow-origi/nlfbmbojpeacfghkpbjhddihlkkiljbi?hl=en
// * enable it
// * configure it to intercept https://<yourJiraRoot>/rest/api/*
app.config(function($httpProvider) {
    $httpProvider.defaults.useXDomain = true;
});

app.controller('MainCtrl', function($scope, $http, $q) {
    // Your Jira server's domain like "yourCompany.atlassian.net" or
    // "jira.yourCompany.local".  "https://" is assumed and added by
    // the code when building a request.
    $scope.domain = ""

    // Your "recent tickets" filter which has JQL like
    //   "worklogAuthor = currentUser() AND updated > -8h"
    $scope.filterNumber = "";

    // Your Jira user ID and password (optionaly cached in local storage)
    $scope.userId = "";
    $scope.password = "";
    
    var storageKey = "jiraTime";

    var domain = localStorage.getItem(storageKey+".Domain");
    if (domain != null) {
        $scope.domain = domain;
    }

    var filter = localStorage.getItem(storageKey+".Filter");
    if (filter != null) {
        $scope.filterNumber = filter;
    }

    var credential = localStorage.getItem(storageKey+".Cred");
    if (credential != null) {
        var parts = atob(credential).split(":");
        $scope.userId = parts[0];
        $scope.password = parts[1]
        // If we found credentials, it's because the user wanted last time
        // to remember them so set remember true now, too.
        $scope.remember = true;
    }

    $scope.submit = function() {
        $scope.apiUrl = "https://" + $scope.domain + "/rest/api/2/";

        credential = btoa($scope.userId + ":" + $scope.password);
        
        if ($scope.remember) {
            console.log("Setting local storage");
            localStorage.setItem(storageKey+".Domain", $scope.domain);
            localStorage.setItem(storageKey+".Filter", $scope.filterNumber);
            localStorage.setItem(storageKey+".Cred", credential);
        }
        else {
            console.log("Clearing local storage");
            localStorage.removeItem(storageKey+".Domain");
            localStorage.removeItem(storageKey+".Filter");
            localStorage.removeItem(storageKey+".Cred");
        }

        $scope.getWork();
        
    };

    // Returns a promise.  When that promise is satisfied, the data
    // passed back is a list of keys of recent tickets.
    $scope.getRecentTickets = function(){
        var deferred = $q.defer();
        var keys = [];

        // If the API URL isn't yet defined, return an empty list.
        if ($scope.apiUrl == undefined) {
            deferred.resolve(keys);
        }
        
        $http({
            url: $scope.apiUrl + "search?jql=filter=" + $scope.filterNumber,
            method: "GET",
            headers: { "Authorization": "Basic " + credential }
        })
            .then(function successCallback(response) {
                angular.forEach(response.data.issues, function(issue,index) {
                    keys.push(issue.key);
                });
                deferred.resolve(keys);
                
            }, function errorCallback(response) {
                console.log("Error");
                deferred.reject(response);
            });

        return deferred.promise;
    };

    $scope.scales = [ "day", "week", "month" ];
    $scope.scale = "day";

    // Compute start of period (day, week, month) from reference date,
    // typically now.
    //
    // @param reference a Date object
    // @return a date object at the start of the period
    var startOfPeriod = function(reference, scale) {
        var start = reference;

        // We always want to start at midnight so we always zero out the
        // time of day components
        start.setHours(0);
        start.setMinutes(0);
        start.setSeconds(0);
        
        switch (scale) {
        case 'week':
            // There is no setDay() so we have to get today's day-of-week
            // and subtract enough time to get to the start of the week
            var ms = start.getTime();
            ms -= start.getDay() * 24 * 60 * 60 * 1000;
            start.setTime(ms);
            break;
            
        case 'month':
            // Set day of month to 1 and we're done
            start.setDate(1)
            break;
        }
        
        return start;
    };

    $scope.getTicketWork = function(key) {
        $http({
            url: $scope.apiUrl+"issue/"+key+"/worklog",
            method: "GET",
            headers: { "Authorization": "Basic " + credential }
        })
            .then(function successCallback(response) {
                var sop = startOfPeriod(new Date(Date.now()), $scope.scale);
                
                var worklogs = response.data.worklogs;

                angular.forEach(worklogs, function(worklog, index) {
                    if (worklog.author.name == $scope.userId) {
                        var ms = Date.parse(worklog.started);
                        var s = new Date(ms);
                        if (s >= sop) {
                            var secondsSpent = parseInt(worklog.timeSpentSeconds);
                            $scope.totalSeconds += secondsSpent;
                            $scope.totalHours = ($scope.totalSeconds/3600.0).toFixed(2);
                            var e = new Date(ms+(secondsSpent*1000));

                            worklog.key = key;
                            worklog.uiStart = s;
                            worklog.uiEnd = e;
                            
                            $scope.work.push(worklog);
                        }
                    }
                });
            }, function errorCallback(response) {
                console.log("Error");
            });
    };

    $scope.getWork = function() {
        // An array of JIRA worklog items from
        // https://docs.atlassian.com/jira/REST/server/#api/2/issue-getIssueWorklog
        // with key, start time and end time added
        $scope.work = []

        $scope.totalSeconds = 0;

        $scope.getRecentTickets()
            .then(function successCallback(keys) {
                angular.forEach(keys, function(key, index) {
                    $scope.getTicketWork(key);
                });
            }, function errorCallback(response) {
                console.log("Error!");
                //FIXME - if we get a 401, remove the stored credentials
                console.log(response);
            });
    };
});

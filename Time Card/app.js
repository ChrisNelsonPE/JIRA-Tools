var app = angular.module('jiratime', []);

// This only works if you
// * install
// https://chrome.google.com/webstore/detail/allow-control-allow-origi/nlfbmbojpeacfghkpbjhddihlkkiljbi?hl=en
// * enable it
// * configure it to intercept https://<yourJiraRoot>/rest/api/*
app.config(function($httpProvider) {
    $httpProvider.defaults.useXDomain = true;
});

app.controller('MainCtrl', function($http, $q) {
    document.title = "Jira Time";
    
    vm = this;
    // Your Jira server's domain like "yourCompany.atlassian.net" or
    // "jira.yourCompany.local".  "https://" is assumed and added by
    // the code when building a request.
    vm.domain = ""

    // Your "recent tickets" filter which has JQL like
    //   "worklogAuthor = currentUser() AND updated > -8h"
    vm.filterNumber = "";

    // Your Jira user ID and password (optionaly cached in local storage)
    vm.userId = "";
    vm.password = "";
    
    var storageKey = "jiraTime";

    var domain = localStorage.getItem(storageKey+".Domain");
    if (domain != null) {
        vm.domain = domain;
    }

    var filter = localStorage.getItem(storageKey+".Filter");
    if (filter != null) {
        vm.filterNumber = filter;
    }

    var credential = localStorage.getItem(storageKey+".Cred");
    if (credential != null) {
        var parts = atob(credential).split(":");
        vm.userId = parts[0];
        vm.password = parts[1]
        // If we found credentials, it's because the user wanted last time
        // to remember them so set remember true now, too.
        vm.remember = true;
    }

    vm.submit = function() {
        vm.apiUrl = "https://" + vm.domain + "/rest/api/2/";

        credential = btoa(vm.userId + ":" + vm.password);
        
        if (vm.remember) {
            console.log("Setting local storage");
            localStorage.setItem(storageKey+".Domain", vm.domain);
            localStorage.setItem(storageKey+".Filter", vm.filterNumber);
            localStorage.setItem(storageKey+".Cred", credential);
        }
        else {
            console.log("Clearing local storage");
            localStorage.removeItem(storageKey+".Domain");
            localStorage.removeItem(storageKey+".Filter");
            localStorage.removeItem(storageKey+".Cred");
        }

        getWork();
        
    };

    // Returns a promise.  When that promise is satisfied, the data
    // passed back is a list of keys of recent tickets.
    var getRecentTickets = function(){
        var deferred = $q.defer();
        var keys = [];

        // If the API URL isn't yet defined, return an empty list.
        if (vm.apiUrl == undefined) {
            deferred.resolve(keys);
        }
        
        $http({
            url: vm.apiUrl + "search?jql=filter=" + vm.filterNumber,
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

    vm.scales = [ "day", "week", "month" ];
    vm.scale = "day";

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

    var getTicketWork = function(key) {
        $http({
            url: vm.apiUrl+"issue/"+key+"/worklog",
            method: "GET",
            headers: { "Authorization": "Basic " + credential }
        })
            .then(function successCallback(response) {
                var sop = startOfPeriod(new Date(Date.now()), vm.scale);
                
                var worklogs = response.data.worklogs;

                angular.forEach(worklogs, function(worklog, index) {
                    if (worklog.author.name == vm.userId) {
                        var ms = Date.parse(worklog.started);
                        var s = new Date(ms);
                        if (s >= sop) {
                            var secondsSpent = parseInt(worklog.timeSpentSeconds);
                            vm.totalSeconds += secondsSpent;
                            vm.totalHours = (vm.totalSeconds/3600.0).toFixed(2);
                            var e = new Date(ms+(secondsSpent*1000));

                            worklog.key = key;
                            worklog.uiStart = s;
                            worklog.uiEnd = e;
                            
                            vm.work.push(worklog);
                        }
                    }
                });
            }, function errorCallback(response) {
                console.log("Error");
            });
    };

    var getWork = function() {
        // An array of JIRA worklog items from
        // https://docs.atlassian.com/jira/REST/server/#api/2/issue-getIssueWorklog
        // with key, start time and end time added
        vm.work = []

        vm.totalSeconds = 0;

        getRecentTickets()
            .then(function successCallback(keys) {
                angular.forEach(keys, function(key, index) {
                    getTicketWork(key);
                });
            }, function errorCallback(response) {
                console.log("Error!");
                //FIXME - if we get a 401, remove the stored credentials
                console.log(response);
            });
    };
});

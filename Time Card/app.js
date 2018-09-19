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
    // passed back is a list of recent tickets.
    var getRecentTickets = function(){
        var deferred = $q.defer();

        // If the API URL isn't yet defined, return an empty list.
        if (vm.apiUrl == undefined) {
            deferred.resolve([]);
        }
        
        // The filter should limit whose work is returned without a time
        // limit
        var url = vm.apiUrl + "search?jql=filter=" + vm.filterNumber;

        // Add a date limit
        var sop = startOfPeriod(new Date(Date.now()), vm.scale, vm.offset);
        url += " and worklogDate >=" + sop.toISOString().substring(0,10);

        // Current period is "to date" so there is no upper limit
        // Previous period ends at the start of the current period.
        if (vm.offset == "previous") {
            var eop = startOfPeriod(new Date(Date.now()), vm.scale, "current");
            url += " and worklogDate <" + eop.toISOString().substring(0,10);
        }

        $http({
            url: url,
            method: "GET",
            headers: { "Authorization": "Basic " + credential }
        })
            .then(function successCallback(response) {
                deferred.resolve(response.data.issues);
                
            }, function errorCallback(response) {
                console.log("Error");
                deferred.reject(response);
            });

        return deferred.promise;
    };

    vm.scales = [ "day", "week", "month" ];
    vm.scale = "day";

    vm.offsets = [ "previous", "current" ];
    vm.offset = "current";

    // Compute start of period (day, week, month) from reference date,
    // typically now.
    //
    // @param reference a Date object
    // @return a date object at the start of the period
    var startOfPeriod = function(reference, scale, offset) {
        var start = reference;

        // We always want to start at midnight so we always zero out the
        // time of day components
        start.setHours(0);
        start.setMinutes(0);
        start.setSeconds(0);
        
        switch (scale) {
        case 'day':
            // If previous day, subtract a day of milliseconds
            if (offset == "previous") {
                var ms = start.getTime();
                ms -= 24 * 60 * 60 * 1000;
                start.setTime(ms);
            }
            break;
        case 'week':
            // There is no setDay() so we have to get today's day-of-week
            // and subtract enough time to get to the start of the week
            var ms = start.getTime();
            ms -= start.getDay() * 24 * 60 * 60 * 1000;
            // If previous week, subtract a week of milliseconds
            if (offset == "previous") {
                ms -= 7 * 24 * 60 * 60 * 1000;
            }
            start.setTime(ms);
            break;
            
        case 'month':
            // Set day of month to 1
            start.setDate(1)
            // If previous month, subtract a day (to get to end of
            // previous month) then set day of month to 1 again.
            if (offset == "previous") {
                var ms = start.getTime();
                ms -= 24 * 60 * 60 * 1000;
                start.setTime(ms);
                start.setDate(1)
            }
            break;
        }
        
        return start;
    };

    var getTicketWork = function(issue) {
        var key = issue.key;

        $http({
            url: vm.apiUrl+"issue/"+key+"/worklog",
            method: "GET",
            headers: { "Authorization": "Basic " + credential }
        })
            .then(function successCallback(response) {
                var sop = startOfPeriod(new Date(Date.now()),
                                        vm.scale,
                                        vm.offset);
                var eop;
                // The end of the previous period is the start of the current
                if (vm.offset == "previous") {
                    eop = startOfPeriod(new Date(Date.now()),
                                            vm.scale,
                                            "current");
                }
                // The current period ends now
                else {
                    eop = new Date(Date.now());
                }

                
                var worklogs = response.data.worklogs;

                angular.forEach(worklogs, function(worklog, index) {
                    var ms = Date.parse(worklog.started);
                    var author = worklog.author.displayName;
                    if (!vm.secondsByAuthor.hasOwnProperty(author)) {
                        vm.secondsByAuthor[author] = 0;
                    }
                    var start = new Date(ms);
                    if (start >= sop && start < eop) {
                        var secondsSpent = parseInt(worklog.timeSpentSeconds);
                        vm.secondsByAuthor[author] += secondsSpent;
                        vm.totalSeconds += secondsSpent;
   
                        var end = new Date(ms+(secondsSpent*1000));

                        worklog.key = key;
                        worklog.ticketLink = "https://" + vm.domain 
                            + "/browse/"+key+"/worklog";
                        worklog.ticketSummary = issue.fields.summary;
                        worklog.uiStart = start;
                        worklog.uiEnd = end;
                        if (!vm.work.hasOwnProperty(author)) {
                            vm.work[author] = [];
                        }
                        
                        vm.work[author].push(worklog);
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
        // Worklogs and total seconds by author
        vm.work = {}
        vm.secondsByAuthor = {};
        vm.totalSeconds = 0;

        getRecentTickets()
            .then(function successCallback(issues) {
                angular.forEach(issues, function(issue, index) {
                    getTicketWork(issue);
                });
            }, function errorCallback(response) {
                console.log("Error!");
                //FIXME - if we get a 401, remove the stored credentials
                console.log(response);
            });
    };
});

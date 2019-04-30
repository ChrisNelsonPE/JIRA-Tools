var app = angular.module('jiratime', []);

// This only works if you
// * install
// https://chrome.google.com/webstore/detail/allow-control-allow-origi/nlfbmbojpeacfghkpbjhddihlkkiljbi?hl=en
// * enable it
// * configure it to intercept https://<yourJiraRoot>/rest/api/*
app.config(function($httpProvider) {
    $httpProvider.defaults.useXDomain = true;
});

app.controller('MainCtrl', function($http, $q, $location) {
    document.title = "Jira Time";
    var headlines = document.getElementsByTagName("h1");
    if (headlines.length > 0) {
        headlines[0].innerText = document.title;
    }
    
    vm = this;
    var parameters = [
        // Your Jira server's domain like "yourCompany.atlassian.net" or
        // "jira.yourCompany.local".  "https://" is assumed and added by
        // the code when building a request.
        //
        // The default is blank when loading from the file system but that's OK.
        { name: 'domain', default: window.location.hostname },

        { name: 'filterNumber', query: 'filter', default: ''},

        // previous, current
        { name: 'offset', query: 'offset', default: 'current'},
        // day, week, month
        { name: 'scale', query: 'scale', default: 'day'},
        
        { name: 'onlyMine', query: 'mine', default: true },
        
        { name: 'credential', default: '' }
    ];

    var storageKey = "jiraTime";

    var query = $location.search();

    // If we found values, it's because the user wanted last time
    // to remember them so set remember true now, too.
    vm.remember = paramLib.loadParameters(storageKey, parameters, vm, query);
    if (vm.credential.length != 0) {
        var parts = atob(vm.credential).split(":");
        vm.userId = parts[0];
        vm.password = parts[1]
    }
    else {
        vm.userId = '';
        vm.password = '';
    }

    vm.submit = function() {
        vm.apiUrl = "https://" + vm.domain + "/rest/api/2/";

        vm.credential = btoa(vm.userId + ":" + vm.password);
        
        // Update URL
        paramLib.processQueryParameters(parameters, vm,                         
                                        $location.search.bind($location));

        // Set or clear local storage
        if (vm.remember) {
            paramLib.saveParameters(storageKey, parameters, vm);
        }
        else {
            paramLib.clearParameters(storageKey, parameters);
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
        
        var url = vm.apiUrl + "search";

        // The default maxResults is 50.  There are often more tickets
        // worked on in a week, surely in a month.  We should handle
        // paging but for now let's just ask for a lot of tickets.
        url += "?maxResults=1000";

        // The filter should limit whose work is returned without a
        // time limit like "worklogAuthor = currentUser()" or
        // "worklogAuthor in membersOf(myGroup)"
        url += "&jql=filter=" + vm.filterNumber;

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
            headers: { "Authorization": "Basic " + vm.credential }
        })
            .then(function successCallback(response) {
                if (response.data.total > response.data.maxResults) {
                    alert("Not all tickets processed." +
                          " Got " + response.data.maxResults +
                          " out of " + response.data.total);
                }
                deferred.resolve(response.data.issues);
            }, function errorCallback(response) {
                // CORS is handled by the client but we want to pass
                // something back to the caller.
                if (response.status == 0 && response.statusText == "") {
                    response.status = 403;
                    response.statusText =
                        "Getting recent ticket data failed in a way" +
                        " that suggests a CORS issue.  See the README" +
                        " for notes about installing and configuring" +
                        " the Allow-Control-Allow-Origin plugin.";
                    alert(response.statusText);
                }
                deferred.reject(response);
            });

        return deferred.promise;
    };

    vm.scales = [ "day", "week", "month" ];
    vm.offsets = [ "previous", "current" ];

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
            headers: { "Authorization": "Basic " + vm.credential }
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
                    
                    var start = new Date(ms);
                    // If not limiting to my time or if this is my time
                    // and the startof the log is within the time we want
                    // process it.
                    if ((!vm.onlyMine || worklog.author.name == vm.userId)
                        && (start >= sop && start < eop)) {
                        
                        if (!vm.secondsByAuthor.hasOwnProperty(author)) {
                            vm.secondsByAuthor[author] = 0;
                        }
                    
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

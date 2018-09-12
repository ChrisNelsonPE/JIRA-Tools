var app = angular.module('jiraworkload', ['chart.js']);

// This only works if you
// * install
// https://chrome.google.com/webstore/detail/allow-control-allow-origi/nlfbmbojpeacfghkpbjhddihlkkiljbi?hl=en
// * enable it
// * configure it to intercept https://<yourJiraRoot>/rest/api/*
app.config(function($httpProvider) {
    $httpProvider.defaults.useXDomain = true;
});

app.controller('MainCtrl', function($scope, $http, $q) {
    document.title = "Jira Workload";

    vm = this;
    // Your Jira server's domain like "yourCompany.atlassian.net" or
    // "jira.yourCompany.local".  "https://" is assumed and added by
    // the code when building a request.
    vm.domain = ""

    // Your "active tickets" filter which has JQL like
    //   "sprint in openSprints()"
    vm.filterNumber = "";

    // Your Jira user ID and password (optionaly cached in local storage)
    vm.userId = "";
    vm.password = "";
    
    var storageKey = "jiraWorkload";

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

        // FIXME - does this belong in the then below?
        vm.assignees = [];
        vm.workHours = [];
        
        getTickets()
            .then(function successCallback(response) {
                // We want the bars in alphabetical order
                assignees = Object.keys(response).sort();
                for (var i = 0; i < assignees.length; ++i) {
                    vm.assignees.push(assignees[i]);
                    vm.workHours.push(response[assignees[i]]);
                }
            }, function errorCallback(response) {
                console.log(response);
            });
        
    };

    var getAssignee = function(ticket) {
        // If undefined, null, or empty, return Unassigned
        if (!ticket.fields.assignee) {
            return "Unassigned";
        }
        else {
            return ticket.fields.assignee.displayName;
        }
    };

    // FIXME - make this configurable
    vm.defaultEstimate = 8;

    var getRemainingHours = function(ticket) {
        if (!ticket.fields.timeestimate) {
            // If there is no estimate at all, default
            if (!ticket.fields.timeoriginalestimate) {
                return vm.defaultEstimate;
            }
            // There is no remaining estimate, but there is a current
            // estimate, scale it from seconds to hours
            else {
                return ticket.fields.timeoriginalestimate / 3600;
            }
        }
        else {
            // There is a remaining estimate, scale it from seconds to
            // hours.
            return ticket.fields.timeestimate / 3600;
        }
    };

    // Returns a promise.  When that promise is satisfied, the data
    // passed back is remaining estimate per assignee
    var getTickets = function(){
        var deferred = $q.defer();
        var workByAssignee = {};

        // If the API URL isn't yet defined, return an empty list.
        if (vm.apiUrl == undefined) {
            deferred.resolve(estimates);
        }
        
        $http({
            url: vm.apiUrl +
                "search?jql=filter=" +
                vm.filterNumber +
                "&maxResults=1000",
            method: "GET",
            headers: { "Authorization": "Basic " + credential }
        })
            // FIXME - handle paged data.  We're not done if
            // data.startAt + data..maxResults < data.total
            .then(function successCallback(response) {
                if (response.data.total > response.data.maxResults) {
                    vm.message = "Showing results for " +
                        response.data.maxResults + " of " +
                        response.data.total + " tickets.";
                }
                else {
                    vm.message = "Showing results for " +
                        response.data.total + " tickets.";
                }
                angular.forEach(response.data.issues, function(issue, index) {
                    var assignee = getAssignee(issue);
                    var hours = getRemainingHours(issue);
                    if (! workByAssignee.hasOwnProperty(assignee)) {
                        workByAssignee[assignee] = 0;
                    }
                    workByAssignee[assignee] += hours;
                });
                deferred.resolve(workByAssignee);
                
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
});
